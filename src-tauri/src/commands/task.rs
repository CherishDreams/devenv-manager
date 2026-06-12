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
    // TODO: verify elevation authorization before performing write operations
    _authorized: bool,
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
    // TODO: verify elevation authorization before performing write operations
    _authorized: bool,
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

    // Check if service elevation is needed
    let needs_service_elevation = install_input
        .as_ref()
        .and_then(|i| i.database_config.as_ref())
        .is_some_and(|db| db.enabled && db.install_as_service);

    // Check if this is an environment write operation
    let environment_write = matches!(
        &input,
        PrivilegeCheckInput::SetActive { .. } | PrivilegeCheckInput::Uninstall { .. }
    ) || install_input
        .as_ref()
        .is_some_and(|i| i.configure_system_env);

    // Check if mode is "direct"
    let is_direct_mode = app_config.environment_management.mode == "direct";

    // Determine if admin is required
    let required = !status.is_administrator
        && (needs_service_elevation || (environment_write && is_direct_mode));

    let reason = if needs_service_elevation {
        "注册数据库 Windows 系统服务需要管理员权限。"
    } else {
        "当前操作需要更新系统环境变量。"
    }
    .to_string();

    let can_switch_to_symlink = required
        && !needs_service_elevation
        && is_direct_mode
        && !matches!(&input, PrivilegeCheckInput::Uninstall { .. });

    let authorization_mode = if !required {
        AuthorizationMode::None
    } else if matches!(&input, PrivilegeCheckInput::Install { .. } | PrivilegeCheckInput::Retry { .. }) {
        AuthorizationMode::RestartApp
    } else {
        AuthorizationMode::ElevatedHelper
    };

    // Convert mode string to enum
    let current_mode = if is_direct_mode {
        EnvironmentManagementMode::Direct
    } else {
        EnvironmentManagementMode::Symlink
    };

    Ok(PrivilegeRequirement {
        required,
        authorized: false,
        reason,
        can_switch_to_symlink,
        current_mode,
        authorization_mode,
    })
}
