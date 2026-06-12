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
