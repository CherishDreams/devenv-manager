use tauri::State;
use crate::error::AppResult;
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
