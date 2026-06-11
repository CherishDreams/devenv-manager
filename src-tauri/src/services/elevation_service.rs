use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::net::windows::named_pipe::{PipeMode, ServerOptions, ClientOptions};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::process::Command;
use crate::error::{AppError, AppResult};
use crate::services::environment_record::EnvironmentRecordService;
use crate::shared::types::*;

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(tag = "type")]
pub enum ElevatedEnvironmentOperation {
    #[serde(rename = "set-active")]
    SetActive { environment: EnvironmentKind, id: String },
    #[serde(rename = "uninstall")]
    Uninstall { id: String },
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
#[serde(tag = "type")]
enum ElevatedBrokerCommand {
    #[serde(rename = "set-active")]
    SetActive { environment: EnvironmentKind, id: String },
    #[serde(rename = "uninstall")]
    Uninstall { id: String },
    #[serde(rename = "ping")]
    Ping,
    #[serde(rename = "shutdown")]
    Shutdown,
}

#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
pub struct ElevatedOperationResult {
    pub ok: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub summary: Option<EnvironmentSummary>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

static ELEVATED_BROKER_PIPE_PATH: tokio::sync::Mutex<Option<String>> = tokio::sync::Mutex::const_new(None);

fn create_pipe_path() -> String {
    format!("\\\\.\\pipe\\env-manager-{}-{}", std::process::id(), uuid::Uuid::new_v4())
}

async fn launch_elevated(extra_args: &[&str]) -> AppResult<()> {
    let mut cmd = Command::new("powershell.exe");
    cmd.args(&["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command"]);

    let args_str = extra_args
        .iter()
        .map(|a| format!("'{}'", a.replace('\'', "''")))
        .collect::<Vec<_>>()
        .join(", ");

    let script = format!(
        "Start-Process -FilePath '{}' -ArgumentList @({}) -Verb RunAs",
        std::env::current_exe()
            .map_err(|e| AppError::Message(format!("获取当前程序路径失败：{}", e)))?
            .to_str()
            .unwrap_or(""),
        args_str
    );

    cmd.arg(&script);

    let status = cmd.status().await
        .map_err(|e| AppError::Message(format!("启动提权进程失败：{}", e)))?;

    if status.success() {
        Ok(())
    } else {
        Err(AppError::Message(format!(
            "提权重启失败，退出码 {}",
            status.code().unwrap_or(-1)
        )))
    }
}

async fn send_broker_command(
    pipe_path: &str,
    command: &ElevatedBrokerCommand,
    timeout_ms: u64,
) -> AppResult<ElevatedOperationResult> {
    let client = ClientOptions::new()
        .open(pipe_path)
        .map_err(|e| AppError::Message(format!("连接管理员辅助进程失败：{}", e)))?;

    let (mut reader, mut writer) = tokio::io::split(client);

    let cmd_json = serde_json::to_string(command)
        .map_err(|e| AppError::Message(format!("序列化命令失败：{}", e)))?;

    writer.write_all(cmd_json.as_bytes()).await
        .map_err(|e| AppError::Message(format!("发送命令失败：{}", e)))?;
    writer.write_all(b"\n").await
        .map_err(|e| AppError::Message(format!("发送命令失败：{}", e)))?;
    writer.flush().await
        .map_err(|e| AppError::Message(format!("发送命令失败：{}", e)))?;

    let mut buffer = String::new();
    let read_future = reader.read_to_string(&mut buffer);

    match tokio::time::timeout(std::time::Duration::from_millis(timeout_ms), read_future).await {
        Ok(Ok(_)) => {
            let line = buffer.lines().next().unwrap_or("").trim();
            serde_json::from_str(line)
                .map_err(|e| AppError::Message(format!("解析响应失败：{}", e)))
        }
        Ok(Err(e)) => Err(AppError::Message(format!("读取响应失败：{}", e))),
        Err(_) => Err(AppError::Message("管理员辅助进程响应超时。".to_string())),
    }
}

async fn wait_for_broker(pipe_path: &str) -> AppResult<()> {
    let start = std::time::Instant::now();
    while start.elapsed() < std::time::Duration::from_secs(30) {
        match send_broker_command(pipe_path, &ElevatedBrokerCommand::Ping, 1000).await {
            Ok(result) if result.ok => return Ok(()),
            _ => {
                tokio::time::sleep(std::time::Duration::from_millis(250)).await;
            }
        }
    }
    Err(AppError::Message("管理员辅助进程启动超时。".to_string()))
}

pub async fn has_active_elevated_broker() -> bool {
    let pipe_path = {
        let guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
        guard.clone()
    };
    if let Some(ref pipe_path) = pipe_path {
        match send_broker_command(pipe_path, &ElevatedBrokerCommand::Ping, 750).await {
            Ok(result) if result.ok => return true,
            _ => {
                let mut guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
                *guard = None;
            }
        }
    }
    false
}

async fn ensure_elevated_broker() -> AppResult<String> {
    // Check if we have an existing broker
    {
        let guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
        if let Some(ref pipe_path) = *guard {
            match send_broker_command(pipe_path, &ElevatedBrokerCommand::Ping, 3000).await {
                Ok(result) if result.ok => return Ok(pipe_path.clone()),
                _ => {
                    // Fall through to create a new broker
                }
            }
        }
    }

    let pipe_path = create_pipe_path();
    launch_elevated(&[
        "--env-manager-elevated-broker",
        &pipe_path,
        &std::process::id().to_string(),
    ])
    .await?;

    wait_for_broker(&pipe_path).await?;

    {
        let mut guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
        *guard = Some(pipe_path.clone());
    }

    Ok(pipe_path)
}

pub async fn request_elevated_environment_operation(
    operation: ElevatedEnvironmentOperation,
) -> AppResult<EnvironmentSummary> {
    let pipe_path = ensure_elevated_broker().await?;

    let command = match operation {
        ElevatedEnvironmentOperation::SetActive { environment, id } => {
            ElevatedBrokerCommand::SetActive { environment, id }
        }
        ElevatedEnvironmentOperation::Uninstall { id } => {
            ElevatedBrokerCommand::Uninstall { id }
        }
    };

    let result = match send_broker_command(&pipe_path, &command, 30000).await {
        Ok(r) => r,
        Err(_) => {
            // Broker died, restart and retry
            {
                let mut guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
                *guard = None;
            }
            let pipe_path = ensure_elevated_broker().await?;
            send_broker_command(&pipe_path, &command, 30000).await?
        }
    };

    if !result.ok || result.summary.is_none() {
        return Err(AppError::Message(
            result.error.unwrap_or_else(|| "管理员操作未完成。".to_string()),
        ));
    }

    Ok(result.summary.unwrap())
}

pub async fn shutdown_elevated_broker() -> AppResult<()> {
    let pipe_path = {
        let guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
        guard.clone()
    };
    if let Some(ref pipe_path) = pipe_path {
        let _ = send_broker_command(pipe_path, &ElevatedBrokerCommand::Shutdown, 5000).await;
        let mut guard = ELEVATED_BROKER_PIPE_PATH.lock().await;
        *guard = None;
    }
    Ok(())
}

/// Start the elevated broker server (called when launched with --env-manager-elevated-broker).
pub async fn start_elevated_broker_server(
    pipe_path: &str,
    env_record: Arc<Mutex<EnvironmentRecordService>>,
) -> AppResult<()> {
    let mut server = ServerOptions::new()
        .pipe_mode(PipeMode::Byte)
        .create(pipe_path)
        .map_err(|e| AppError::Message(format!("创建命名管道失败：{}", e)))?;

    loop {
        // Wait for a client to connect.
        server.connect().await
            .map_err(|e| AppError::Message(format!("等待客户端连接失败：{}", e)))?;

        // Take the connected server, create a new one for the next client.
        let mut client = std::mem::replace(
            &mut server,
            ServerOptions::new()
                .pipe_mode(PipeMode::Byte)
                .create(pipe_path)
                .map_err(|e| AppError::Message(format!("创建命名管道失败：{}", e)))?,
        );

        let env_record = env_record.clone();

        tauri::async_runtime::spawn(async move {
            let mut buffer = String::new();
            if let Err(e) = client.read_to_string(&mut buffer).await {
                eprintln!("读取客户端命令失败：{}", e);
                return;
            }

            let line = buffer.lines().next().unwrap_or("").trim();
            let command: Result<ElevatedBrokerCommand, _> = serde_json::from_str(line);

            let result = match command {
                Ok(ElevatedBrokerCommand::Ping) => ElevatedOperationResult {
                    ok: true,
                    summary: None,
                    error: None,
                },
                Ok(ElevatedBrokerCommand::Shutdown) => {
                    let result = ElevatedOperationResult {
                        ok: true,
                        summary: None,
                        error: None,
                    };
                    let json = serde_json::to_string(&result).unwrap();
                    let _ = client.write_all(json.as_bytes()).await;
                    let _ = client.write_all(b"\n").await;
                    let _ = client.flush().await;
                    std::process::exit(0);
                }
                Ok(ElevatedBrokerCommand::SetActive { environment, id }) => {
                    let env_rec = env_record.lock().await;
                    match env_rec.set_active(&environment, &id).await {
                        Ok(summary) => ElevatedOperationResult {
                            ok: true,
                            summary: Some(summary),
                            error: None,
                        },
                        Err(e) => ElevatedOperationResult {
                            ok: false,
                            summary: None,
                            error: Some(e.to_string()),
                        },
                    }
                }
                Ok(ElevatedBrokerCommand::Uninstall { id }) => {
                    let env_rec = env_record.lock().await;
                    match env_rec.uninstall_managed(&id).await {
                        Ok(summary) => ElevatedOperationResult {
                            ok: true,
                            summary: Some(summary),
                            error: None,
                        },
                        Err(e) => ElevatedOperationResult {
                            ok: false,
                            summary: None,
                            error: Some(e.to_string()),
                        },
                    }
                }
                Err(e) => ElevatedOperationResult {
                    ok: false,
                    summary: None,
                    error: Some(format!("解析命令失败：{}", e)),
                },
            };

            let json = serde_json::to_string(&result).unwrap();
            let _ = client.write_all(json.as_bytes()).await;
            let _ = client.write_all(b"\n").await;
            let _ = client.flush().await;
        });
    }
}
