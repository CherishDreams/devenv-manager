use std::collections::HashMap;
use std::path::Path;
use tokio::process::Command;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};

/// Run a process and capture its stdout/stderr. Supports cancellation via CancellationToken
/// and optional extra environment variables.
pub async fn run_process(
    command: &str,
    args: &[&str],
    cancel: &CancellationToken,
    extra_env: Option<&HashMap<String, String>>,
) -> AppResult<(String, String)> {
    let mut cmd = Command::new(command);
    cmd.args(args);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    if let Some(env) = extra_env {
        cmd.envs(env);
    }

    cmd.stdout(std::process::Stdio::piped());
    cmd.stderr(std::process::Stdio::piped());

    let mut child = cmd.spawn().map_err(|e| {
        AppError::Message(format!("启动进程失败 {}: {}", command, e))
    })?;

    let stdout_handle = child.stdout.take();
    let stderr_handle = child.stderr.take();

    let stdout_future = async {
        if let Some(mut stdout) = stdout_handle {
            use tokio::io::AsyncReadExt;
            let mut buf = String::new();
            let _ = stdout.read_to_string(&mut buf).await;
            buf
        } else {
            String::new()
        }
    };

    let stderr_future = async {
        if let Some(mut stderr) = stderr_handle {
            use tokio::io::AsyncReadExt;
            let mut buf = String::new();
            let _ = stderr.read_to_string(&mut buf).await;
            buf
        } else {
            String::new()
        }
    };

    tokio::select! {
        result = child.wait() => {
            let stdout = stdout_future.await;
            let stderr = stderr_future.await;
            let status = result.map_err(|e| AppError::Message(format!("等待进程退出失败 {}: {}", command, e)))?;
            if status.success() {
                Ok((stdout, stderr))
            } else {
                let code = status.code().unwrap_or(-1);
                let name = Path::new(command)
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(command);
                let detail = if stderr.trim().is_empty() { &stdout } else { &stderr };
                Err(AppError::Message(format!(
                    "{} 退出码 {}\n{}",
                    name, code, detail.trim()
                )))
            }
        }
        _ = cancel.cancelled() => {
            let _ = child.kill().await;
            Err(AppError::Message("任务已取消。".to_string()))
        }
    }
}
