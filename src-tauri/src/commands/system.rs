use tauri::State;
use crate::error::AppResult;
use crate::state::AppState;
use crate::services::system_status::SystemStatus;

#[tauri::command]
pub async fn system_get_status(state: State<'_, AppState>) -> AppResult<SystemStatus> {
    let system_status = state.system_status.lock().await;
    system_status.get_status().await
}
