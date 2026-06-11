use tauri::{AppHandle, Emitter};
use crate::state::AppState;
use crate::shared::types::*;

#[tauri::command]
pub async fn environments_get_summary(
    state: tauri::State<'_, AppState>,
) -> Result<EnvironmentSummary, String> {
    let env_record = state.environment_record.lock().await;
    env_record.get_summary().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn environments_discover(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<DiscoveredEnvironment>, String> {
    let discovery = state.environment_discovery.lock().await;
    discovery.discover().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn environments_adopt(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    inputs: Vec<AdoptEnvironmentInput>,
) -> Result<EnvironmentSummary, String> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.adopt_existing_installs(inputs).await.map_err(|e| e.to_string())?
    };
    // Emit event
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn environments_set_active(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    environment: EnvironmentKind,
    id: String,
    #[allow(unused_variables)] authorized: bool,
) -> Result<EnvironmentSummary, String> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.set_active(&environment, &id).await.map_err(|e| e.to_string())?
    };
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}

#[tauri::command]
pub async fn environments_uninstall(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
    #[allow(unused_variables)] authorized: bool,
) -> Result<EnvironmentSummary, String> {
    let summary = {
        let env_record = state.environment_record.lock().await;
        env_record.uninstall_managed(&id).await.map_err(|e| e.to_string())?
    };
    let _ = app.emit("environments:changed", &summary);
    Ok(summary)
}
