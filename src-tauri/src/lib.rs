#![allow(dead_code)]

use tauri::Manager;

mod error;
mod state;
mod shared;
mod environment_records;
mod services;
mod commands;

use state::AppState;
use services::config::ConfigService;
use services::system_status::SystemStatusService;
use services::environment_record::EnvironmentRecordService;
use services::environment_discovery::EnvironmentDiscoveryService;
use services::version_catalog::service::VersionCatalogService;
use services::task_service::TaskService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize core services
            let config_service = ConfigService::new(app_handle.clone())?;
            let system_status_service = SystemStatusService::new();

            let config_arc = std::sync::Arc::new(tokio::sync::Mutex::new(config_service));

            // Initialize environment services (depend on config)
            let environment_record_service = EnvironmentRecordService::new(
                app_handle.clone(),
                config_arc.clone(),
            )?;

            let env_record_arc = std::sync::Arc::new(tokio::sync::Mutex::new(environment_record_service));

            let environment_discovery_service = EnvironmentDiscoveryService::new(
                env_record_arc.clone(),
                config_arc.clone(),
            );

            let version_catalog_service = VersionCatalogService::new(config_arc.clone());

            // Initialize task service (depends on config + env_record)
            let task_service = TaskService::new(
                app_handle.clone(),
                config_arc.clone(),
                env_record_arc.clone(),
            )?;

            let task_arc = std::sync::Arc::new(tokio::sync::Mutex::new(task_service));

            // Create app state
            let state = AppState {
                app_handle,
                config: config_arc,
                system_status: std::sync::Arc::new(tokio::sync::Mutex::new(system_status_service)),
                environment_record: env_record_arc,
                environment_discovery: std::sync::Arc::new(tokio::sync::Mutex::new(environment_discovery_service)),
                version_catalog: std::sync::Arc::new(tokio::sync::Mutex::new(version_catalog_service)),
                task: task_arc,
            };

            app.manage(state);

            // Restore tasks from disk (async, fire-and-forget)
            let task_arc_restore = {
                let s = app.state::<AppState>();
                s.task.clone()
            };
            tauri::async_runtime::spawn(async move {
                let mut svc = task_arc_restore.lock().await;
                let _ = svc.restore().await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config_get,
            commands::config_update,
            commands::system_get_status,
            commands::dialog_select_directory,
            commands::environments_get_summary,
            commands::environments_discover,
            commands::environments_adopt,
            commands::environments_set_active,
            commands::environments_uninstall,
            commands::catalog_list_versions,
            commands::tasks_list,
            commands::tasks_create_install,
            commands::tasks_cancel,
            commands::tasks_retry,
            commands::tasks_remove,
            commands::tasks_clear_finished,
            commands::tasks_get_retry_input,
            commands::permissions_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
