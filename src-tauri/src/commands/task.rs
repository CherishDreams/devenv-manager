use tauri::State;
use crate::error::AppResult;
use crate::shared::types::*;
use crate::state::AppState;

/// Returns a list of all managed tasks (active and completed).
#[tauri::command]
pub async fn tasks_list(state: State<'_, AppState>) -> AppResult<Vec<ManagedTask>> {
    let svc = state.task.lock().await;
    Ok(svc.list().await)
}

/// Creates a new background installation task and returns the created task.
#[tauri::command]
pub async fn tasks_create_install(
    state: State<'_, AppState>,
    input: InstallTaskInput,
) -> AppResult<ManagedTask> {
    let mut svc = state.task.lock().await;
    Ok(svc.create_install_task(input).await)
}

/// Cancels a running task by ID and returns the updated task.
#[tauri::command]
pub async fn tasks_cancel(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<ManagedTask>> {
    let mut svc = state.task.lock().await;
    Ok(svc.cancel_task(&id).await)
}

/// Retries a previously failed task and returns the restarted task.
#[tauri::command]
pub async fn tasks_retry(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<ManagedTask> {
    let mut svc = state.task.lock().await;
    svc.retry_task(&id).await
}

/// Removes a task from the task list and returns the remaining tasks.
#[tauri::command]
pub async fn tasks_remove(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Vec<ManagedTask>> {
    let mut svc = state.task.lock().await;
    svc.remove_task(&id).await
}

/// Removes all completed or cancelled tasks and returns the remaining active tasks.
#[tauri::command]
pub async fn tasks_clear_finished(
    state: State<'_, AppState>,
) -> AppResult<Vec<ManagedTask>> {
    let mut svc = state.task.lock().await;
    Ok(svc.clear_inactive().await)
}

/// Retrieves the original install input of a task for retry purposes.
#[tauri::command]
pub async fn tasks_get_retry_input(
    state: State<'_, AppState>,
    id: String,
) -> AppResult<Option<InstallTaskInput>> {
    let svc = state.task.lock().await;
    Ok(svc.get_retry_input(&id).await)
}

/// Checks whether the current operation requires administrator privileges.
#[tauri::command]
pub async fn permissions_check(
    state: State<'_, AppState>,
    input: PrivilegeCheckInput,
) -> AppResult<PrivilegeRequirement> {
    let config = state.config.lock().await;
    let app_config = config.get().await?;
    let system_status = state.system_status.lock().await;
    let status = system_status.get_status().await?;

    // Get the install input if applicable
    let install_input = match &input {
        PrivilegeCheckInput::Install { input } => Some(input.clone()),
        PrivilegeCheckInput::Retry { id } => {
            let svc = state.task.lock().await;
            svc.get_retry_input(id).await
        }
        _ => None,
    };

    // Check if service elevation is needed (only database service registration requires admin)
    let needs_service_elevation = install_input
        .as_ref()
        .and_then(|i| i.database_config.as_ref())
        .is_some_and(|db| db.enabled && db.install_as_service);

    // When env_scope is "system", writing env vars requires admin.
    let env_scope = &app_config.environment_management.env_scope;
    let needs_env_elevation = env_scope == "system";

    let required = !status.is_administrator && (needs_service_elevation || needs_env_elevation);

    let reason = if needs_service_elevation {
        "注册数据库 Windows 系统服务需要管理员权限。"
    } else if needs_env_elevation {
        "环境变量写入系统级注册表 (HKLM) 需要管理员权限。"
    } else {
        ""
    }
    .to_string();

    // No longer applicable since env vars are written to HKCU by default.
    let can_switch_to_symlink = false;

    let authorization_mode = if !required {
        AuthorizationMode::None
    } else {
        AuthorizationMode::RestartApp
    };

    // Convert mode string to enum
    let is_direct_mode = app_config.environment_management.mode == "direct";
    let current_mode = if is_direct_mode {
        EnvironmentManagementMode::Direct
    } else {
        EnvironmentManagementMode::Symlink
    };

    Ok(PrivilegeRequirement {
        required,
        reason,
        can_switch_to_symlink,
        current_mode,
        authorization_mode,
    })
}
