use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{Mutex, mpsc};
use tokio_util::sync::CancellationToken;
use tauri::{AppHandle, Emitter, Manager};
use tauri::path::BaseDirectory;
use crate::error::{AppError, AppResult};
use crate::services::config::ConfigService;
use crate::services::environment_record::{EnvironmentRecordService, AddManagedInstallInput};
use crate::services::installer_service::{InstallerCallbacks, run_installation};
use crate::services::json_file_store::JsonFileStore;
use crate::shared::environment_definitions::environment_definitions;
use crate::shared::types::*;

fn create_log(message: &str, level: &str) -> TaskLogEntry {
    TaskLogEntry {
        at: chrono::Utc::now().to_rfc3339(),
        level: level.to_string(),
        message: message.to_string(),
    }
}

fn is_active(task: &ManagedTask) -> bool {
    task.status == TaskStatus::Queued || task.status == TaskStatus::Running
}

fn clone_input(input: &InstallTaskInput) -> InstallTaskInput {
    InstallTaskInput {
        environment: input.environment.clone(),
        vendor: input.vendor.clone(),
        version: input.version.clone(),
        scope: input.scope.clone(),
        install_path: input.install_path.clone(),
        configure_system_env: input.configure_system_env,
        database_config: input.database_config.clone(),
    }
}

#[derive(Clone, serde::Serialize, serde::Deserialize)]
struct TaskData {
    tasks: Vec<ManagedTask>,
}

impl Default for TaskData {
    fn default() -> Self {
        Self { tasks: Vec::new() }
    }
}

/// Internal update messages sent from the install worker to the update loop.
enum TaskUpdate {
    Log { id: String, message: String, level: String },
    Progress { id: String, progress: f64 },
    Download { id: String, progress: TaskDownloadProgress },
    Status { id: String, status: TaskStatus, log: Option<TaskLogEntry> },
    Done { id: String },
}

pub struct TaskService {
    app_handle: AppHandle,
    config: Arc<Mutex<ConfigService>>,
    env_record: Arc<Mutex<EnvironmentRecordService>>,
    tasks: Vec<ManagedTask>,
    controllers: HashMap<String, CancellationToken>,
    store: JsonFileStore<TaskData>,
    update_tx: mpsc::UnboundedSender<TaskUpdate>,
}

impl TaskService {
    pub fn new(
        app_handle: AppHandle,
        config: Arc<Mutex<ConfigService>>,
        env_record: Arc<Mutex<EnvironmentRecordService>>,
    ) -> AppResult<Self> {
        let tasks_path = app_handle
            .path()
            .resolve("tasks.json", BaseDirectory::AppData)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        let (update_tx, update_rx) = mpsc::unbounded_channel();

        // The background update loop owns the shared task list and the store.
        // It processes mutations from the channel, persists, and emits events.
        // This avoids holding the TaskService mutex during long-running installs.
        let tasks_shared = Arc::new(Mutex::new(Vec::<ManagedTask>::new()));
        let tasks_for_loop = tasks_shared.clone();
        let app_handle_loop = app_handle.clone();
        let store_for_loop = JsonFileStore::new(tasks_path, TaskData::default());

        tauri::async_runtime::spawn(async move {
            let mut rx = update_rx;
            while let Some(update) = rx.recv().await {
                let mut tasks = tasks_for_loop.lock().await;
                match update {
                    TaskUpdate::Log { id, message, level } => {
                        if let Some(task) = tasks.iter_mut().find(|t| t.id == id) {
                            task.logs.push(create_log(&message, &level));
                            task.updated_at = chrono::Utc::now().to_rfc3339();
                        }
                    }
                    TaskUpdate::Progress { id, progress } => {
                        if let Some(task) = tasks.iter_mut().find(|t| t.id == id) {
                            task.progress = progress;
                            task.updated_at = chrono::Utc::now().to_rfc3339();
                        }
                    }
                    TaskUpdate::Download { id, progress } => {
                        if let Some(task) = tasks.iter_mut().find(|t| t.id == id) {
                            task.download = Some(progress);
                            task.updated_at = chrono::Utc::now().to_rfc3339();
                        }
                    }
                    TaskUpdate::Status { id, status, log } => {
                        if let Some(task) = tasks.iter_mut().find(|t| t.id == id) {
                            task.status = status;
                            if let Some(entry) = log {
                                task.logs.push(entry);
                            }
                            task.updated_at = chrono::Utc::now().to_rfc3339();
                        }
                    }
                    TaskUpdate::Done { .. } => {
                        // Just triggers persist + emit below
                    }
                }
                // Persist and emit
                let data = TaskData { tasks: tasks.clone() };
                let _ = store_for_loop.write(&data).await;
                let _ = app_handle_loop.emit("task:changed", &*tasks);
            }
        });

        // The struct also needs a second store for its own reads (restore).
        let tasks_path2 = app_handle
            .path()
            .resolve("tasks.json", BaseDirectory::AppData)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        Ok(Self {
            app_handle,
            config,
            env_record,
            tasks: Vec::new(),
            controllers: HashMap::new(),
            store: JsonFileStore::new(tasks_path2, TaskData::default()),
            update_tx,
        })
    }

    /// Restore tasks from disk on startup.
    pub async fn restore(&mut self) -> AppResult<()> {
        let data = self.store.read().await.unwrap_or(TaskData::default());
        let now = chrono::Utc::now().to_rfc3339();
        let mut changed = false;

        self.tasks = data
            .tasks
            .into_iter()
            .map(|mut task| {
                if is_active(&task) {
                    changed = true;
                    task.status = TaskStatus::Failed;
                    task.updated_at = now.clone();
                    task.logs.push(create_log(
                        "程序重启时任务尚未完成，已标记为中断。可重试此任务。",
                        "warn",
                    ));
                }
                task
            })
            .collect();

        if changed {
            self.persist().await;
        }
        Ok(())
    }

    pub fn list(&self) -> Vec<ManagedTask> {
        self.tasks.clone()
    }

    pub async fn create_install_task(&mut self, input: InstallTaskInput) -> ManagedTask {
        let now = chrono::Utc::now().to_rfc3339();
        let title = [
            Some(input.environment.to_string().to_uppercase()),
            input.vendor.clone(),
            Some(input.version.clone()),
        ]
        .iter()
        .filter_map(|p| p.as_ref())
        .cloned()
        .collect::<Vec<_>>()
        .join(" ");

        let task = ManagedTask {
            id: uuid::Uuid::new_v4().to_string(),
            title,
            status: TaskStatus::Queued,
            progress: 0.0,
            created_at: now.clone(),
            updated_at: now,
            input: Some(clone_input(&input)),
            download: None,
            logs: vec![
                create_log("安装任务已创建。", "info"),
                create_log("安装器已进入执行队列。", "info"),
            ],
        };

        self.tasks.insert(0, task.clone());
        self.persist().await;
        let _ = self.app_handle.emit("task:changed", &self.tasks);

        let task_id = task.id.clone();
        self.start_install_task(&task_id, clone_input(&input));

        task
    }

    pub fn get_retry_input(&self, id: &str) -> Option<InstallTaskInput> {
        self.tasks.iter().find(|t| t.id == id)?.input.as_ref().map(clone_input)
    }

    pub async fn retry_task(&mut self, id: &str) -> AppResult<ManagedTask> {
        let task = self.tasks.iter().find(|t| t.id == id)
            .ok_or_else(|| AppError::Message("未找到要重试的任务。".to_string()))?;

        if task.status != TaskStatus::Failed {
            return Err(AppError::Message("只有失败任务可以重试。".to_string()));
        }

        let input = task.input.as_ref().map(clone_input)
            .ok_or_else(|| AppError::Message("该任务缺少可重试的安装参数，请重新创建安装任务。".to_string()))?;

        let now = chrono::Utc::now().to_rfc3339();
        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == id) {
            task.status = TaskStatus::Queued;
            task.progress = 0.0;
            task.download = None;
            task.updated_at = now;
            task.logs.push(create_log("任务已重新加入队列，等待执行。", "info"));
        }

        self.persist().await;
        let _ = self.app_handle.emit("task:changed", &self.tasks);

        let task_id = id.to_string();
        self.start_install_task(&task_id, clone_input(&input));

        Ok(self.tasks.iter().find(|t| t.id == id).unwrap().clone())
    }

    pub async fn cancel_task(&mut self, id: &str) -> Option<ManagedTask> {
        let task = self.tasks.iter().find(|t| t.id == id)?;
        if !is_active(task) {
            return Some(task.clone());
        }

        if let Some(token) = self.controllers.remove(id) {
            token.cancel();
        }

        if let Some(task) = self.tasks.iter_mut().find(|t| t.id == id) {
            task.status = TaskStatus::Cancelled;
            task.logs.push(create_log("任务已取消。", "warn"));
            task.updated_at = chrono::Utc::now().to_rfc3339();
        }

        self.persist().await;
        let _ = self.app_handle.emit("task:changed", &self.tasks);
        self.tasks.iter().find(|t| t.id == id).cloned()
    }

    pub async fn remove_task(&mut self, id: &str) -> AppResult<Vec<ManagedTask>> {
        if !self.tasks.iter().any(|t| t.id == id) {
            return Ok(self.tasks.clone());
        }
        if self.tasks.iter().any(|t| t.id == id && is_active(t)) {
            return Err(AppError::Message("进行中的任务不能移除，请先取消任务。".to_string()));
        }
        self.tasks.retain(|t| t.id != id);
        self.persist().await;
        let _ = self.app_handle.emit("task:changed", &self.tasks);
        Ok(self.tasks.clone())
    }

    pub async fn clear_finished(&mut self) -> Vec<ManagedTask> {
        self.tasks.retain(|t| is_active(t));
        self.persist().await;
        let _ = self.app_handle.emit("task:changed", &self.tasks);
        self.tasks.clone()
    }

    // ── Internal ─────────────────────────────────────────────────────────

    async fn persist(&self) {
        let data = TaskData { tasks: self.tasks.clone() };
        let _ = self.store.write(&data).await;
    }

    fn start_install_task(&mut self, id: &str, input: InstallTaskInput) {
        let cancel = CancellationToken::new();
        self.controllers.insert(id.to_string(), cancel.clone());

        let config = self.config.clone();
        let env_record = self.env_record.clone();
        let app_handle = self.app_handle.clone();
        let task_id = id.to_string();
        let update_tx = self.update_tx.clone();

        tauri::async_runtime::spawn(async move {
            // Mark as running
            let _ = update_tx.send(TaskUpdate::Status {
                id: task_id.clone(),
                status: TaskStatus::Running,
                log: Some(create_log("任务开始执行。", "info")),
            });

            // Get config snapshot for the installation
            let app_config = {
                let cfg = config.lock().await;
                match cfg.get().await {
                    Ok(c) => c,
                    Err(e) => {
                        let _ = update_tx.send(TaskUpdate::Status {
                            id: task_id.clone(),
                            status: TaskStatus::Failed,
                            log: Some(create_log(&format!("读取配置失败：{}", e), "error")),
                        });
                        return;
                    }
                }
            };

            let cb = InstallerCallbacks {
                on_log: Box::new({
                    let tx = update_tx.clone();
                    let id = task_id.clone();
                    move |msg: &str, level: &str| {
                        let _ = tx.send(TaskUpdate::Log {
                            id: id.clone(),
                            message: msg.to_string(),
                            level: level.to_string(),
                        });
                    }
                }),
                on_progress: Box::new({
                    let tx = update_tx.clone();
                    let id = task_id.clone();
                    move |progress: f64| {
                        let _ = tx.send(TaskUpdate::Progress {
                            id: id.clone(),
                            progress,
                        });
                    }
                }),
                on_download_progress: Box::new({
                    let tx = update_tx.clone();
                    let id = task_id.clone();
                    move |progress: TaskDownloadProgress| {
                        let _ = tx.send(TaskUpdate::Download {
                            id: id.clone(),
                            progress,
                        });
                    }
                }),
            };

            let result = run_installation(&input, &app_config, &cb, &cancel).await;

            match result {
                Ok(install_result) => {
                    let definition = environment_definitions()
                        .into_iter()
                        .find(|d| d.id == input.environment);

                    {
                        let env_rec = env_record.lock().await;
                        let _ = env_rec
                            .add_managed_install(AddManagedInstallInput {
                                environment: input.environment.clone(),
                                name: definition
                                    .as_ref()
                                    .map(|d| d.name.clone())
                                    .unwrap_or_else(|| input.environment.to_string()),
                                vendor: input.vendor.clone(),
                                version: install_result.resolved_version.clone(),
                                install_path: install_result.install_path.clone(),
                                scope: input.scope.clone(),
                                active: input.configure_system_env,
                                env_vars: install_result.env_vars.clone(),
                                path_entries: install_result.path_entries.clone(),
                            })
                            .await;
                    }

                    {
                        let env_rec = env_record.lock().await;
                        if let Ok(summary) = env_rec.get_summary().await {
                            let _ = app_handle.emit("environment:changed", &summary);
                        }
                    }

                    if !install_result.verification_output.is_empty() {
                        let _ = update_tx.send(TaskUpdate::Log {
                            id: task_id.clone(),
                            message: install_result.verification_output.clone(),
                            level: "info".to_string(),
                        });
                    }

                    let _ = update_tx.send(TaskUpdate::Status {
                        id: task_id.clone(),
                        status: TaskStatus::Succeeded,
                        log: Some(create_log("安装完成。", "info")),
                    });
                }
                Err(e) => {
                    if cancel.is_cancelled() {
                        let _ = update_tx.send(TaskUpdate::Status {
                            id: task_id.clone(),
                            status: TaskStatus::Cancelled,
                            log: Some(create_log("任务已取消。", "warn")),
                        });
                    } else {
                        let _ = update_tx.send(TaskUpdate::Status {
                            id: task_id.clone(),
                            status: TaskStatus::Failed,
                            log: Some(create_log(&e.to_string(), "error")),
                        });
                    }
                }
            }

            let _ = update_tx.send(TaskUpdate::Done { id: task_id });
        });
    }
}
