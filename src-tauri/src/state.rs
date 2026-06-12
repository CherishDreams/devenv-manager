//! Application state shared across all Tauri command handlers.

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;

use crate::services::config::ConfigService;
use crate::services::system_status::SystemStatusService;
use crate::services::environment_record::EnvironmentRecordService;
use crate::services::environment_discovery::EnvironmentDiscoveryService;
use crate::services::version_catalog::service::VersionCatalogService;
use crate::services::task_service::TaskService;

/// Global application state shared across all command handlers via Tauri's managed state.
pub struct AppState {
    /// Handle to the Tauri application, used for emitting events and accessing app APIs.
    #[allow(dead_code)]
    pub app_handle: AppHandle,
    /// Configuration service managing persistent application settings.
    pub config: Arc<Mutex<ConfigService>>,
    /// Service providing system status information such as admin privileges.
    pub system_status: Arc<Mutex<SystemStatusService>>,
    /// Service for managing environment records and registry operations.
    pub environment_record: Arc<Mutex<EnvironmentRecordService>>,
    /// Service for discovering installed environments on the system.
    pub environment_discovery: Arc<Mutex<EnvironmentDiscoveryService>>,
    /// Service for querying available versions from the version catalog.
    pub version_catalog: Arc<Mutex<VersionCatalogService>>,
    /// Service managing background installation and uninstallation tasks.
    pub task: Arc<Mutex<TaskService>>,
}
