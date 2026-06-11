use crate::error::AppResult;
use crate::shared::types::*;
use crate::state::AppState;

#[tauri::command]
pub async fn task_list(state: tauri::State<'_, AppState>) -> AppResult<Vec<ManagedTask>> {
    let svc = state.task.lock().await;
    Ok(svc.list())
}

#[tauri::command]
pub async fn task_create(
    state: tauri::State<'_, AppState>,
    input: InstallTaskInput,
) -> AppResult<ManagedTask> {
    let mut svc = state.task.lock().await;
    Ok(svc.create_install_task(input).await)
}

#[tauri::command]
pub async fn task_cancel(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Option<ManagedTask>> {
    let mut svc = state.task.lock().await;
    Ok(svc.cancel_task(&id).await)
}

#[tauri::command]
pub async fn task_retry(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<ManagedTask> {
    let mut svc = state.task.lock().await;
    svc.retry_task(&id).await
}

#[tauri::command]
pub async fn task_remove(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ManagedTask>> {
    let mut svc = state.task.lock().await;
    svc.remove_task(&id).await
}

#[tauri::command]
pub async fn task_clear_finished(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<ManagedTask>> {
    let mut svc = state.task.lock().await;
    Ok(svc.clear_finished().await)
}

#[tauri::command]
pub async fn task_get_retry_input(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Option<InstallTaskInput>> {
    let svc = state.task.lock().await;
    Ok(svc.get_retry_input(&id))
}
