use tauri::State;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::services::config::AppConfig;

/// Returns the current application configuration.
#[tauri::command]
pub async fn config_get(state: State<'_, AppState>) -> AppResult<AppConfig> {
    let config_service = state.config.lock().await;
    config_service.get().await
}

/// Applies a partial JSON patch to the configuration and returns the updated result.
#[tauri::command]
pub async fn config_update(
    state: State<'_, AppState>,
    patch: serde_json::Value,
) -> AppResult<AppConfig> {
    let config_service = state.config.lock().await;
    config_service.update(patch).await
}

/// Switches the environment variable storage scope (user ↔ system),
/// migrating all managed variables from the old scope to the new one.
#[tauri::command]
pub async fn config_switch_env_scope(
    state: State<'_, AppState>,
    scope: String,
) -> AppResult<()> {
    let env_record = state.environment_record.lock().await;
    env_record.switch_env_scope(&scope).await?;

    // Persist the new scope to config.
    let config_service = state.config.lock().await;
    config_service
        .update(serde_json::json!({
            "environmentManagement": { "envScope": scope }
        }))
        .await?;

    Ok(())
}

/// Saves a pending scope change and relaunches the app as administrator.
///
/// Flow:
/// 1. Write `pendingEnvScope` to config (so the elevated instance knows what to do).
/// 2. Launch a new instance of the app via `Start-Process -Verb RunAs`.
/// 3. Exit the current (non-elevated) process.
///
/// The elevated instance will detect `pendingEnvScope` on startup,
/// perform the registry migration, then clear the field.
#[tauri::command]
pub async fn config_relaunch_as_admin(
    state: State<'_, AppState>,
    target_scope: String,
) -> AppResult<()> {
    // Step 1 – persist the pending scope so the elevated instance picks it up.
    {
        let config_service = state.config.lock().await;
        config_service
            .update(serde_json::json!({
                "environmentManagement": { "pendingEnvScope": target_scope }
            }))
            .await?;
    }

    // Step 2 – launch the same executable as admin.
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Message(format!("获取当前程序路径失败：{}", e)))?;

    let exe_str = exe
        .to_str()
        .ok_or_else(|| AppError::Message("程序路径包含无效字符".to_string()))?;

    let status = tokio::process::Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            &format!("Start-Process -FilePath '{}' -Verb RunAs", exe_str),
        ])
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .status()
        .await
        .map_err(|e| AppError::Message(format!("启动提权进程失败：{}", e)))?;

    if !status.success() {
        return Err(AppError::Message(format!(
            "提权重启失败，退出码 {}",
            status.code().unwrap_or(-1)
        )));
    }

    // Step 3 – exit the current process.  The elevated instance will take over.
    std::process::exit(0);
}
