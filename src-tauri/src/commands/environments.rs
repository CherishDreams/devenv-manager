use tauri::{AppHandle, Emitter, State};
use crate::error::AppResult;
use crate::state::AppState;
use crate::shared::types::*;

/// Returns a summary of all registered environments.
#[tauri::command]
pub async fn environments_get_summary(
    state: State<'_, AppState>,
) -> AppResult<EnvironmentSummary> {
    let env_record = state.environment_record.lock().await;
    env_record.get_summary().await
}

/// Discovers unregistered environments installed on the system.
#[tauri::command]
pub async fn environments_discover(
    state: State<'_, AppState>,
) -> AppResult<Vec<DiscoveredEnvironment>> {
    let discovery = state.environment_discovery.lock().await;
    discovery.discover().await
}

/// Adopts existing environment installations and returns the updated summary.
#[tauri::command]
pub async fn environments_adopt(
    app: AppHandle,
    state: State<'_, AppState>,
    inputs: Vec<AdoptEnvironmentInput>,
) -> AppResult<EnvironmentSummary> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.adopt_existing_installs(inputs).await?
    };
    // Emit event
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}

/// Sets the active environment version and emits a change event.
#[tauri::command]
pub async fn environments_set_active(
    app: AppHandle,
    state: State<'_, AppState>,
    environment: EnvironmentKind,
    id: String,
    // TODO: verify elevation authorization before performing write operations
    _authorized: bool,
) -> AppResult<EnvironmentSummary> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.set_active(&environment, &id).await?
    };
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}

/// Uninstalls a managed environment and emits a change event.
#[tauri::command]
pub async fn environments_uninstall(
    app: AppHandle,
    state: State<'_, AppState>,
    id: String,
    // TODO: verify elevation authorization before performing write operations
    _authorized: bool,
) -> AppResult<EnvironmentSummary> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.uninstall_managed(&id).await?
    };
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}
