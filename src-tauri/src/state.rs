use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::AppHandle;

use crate::services::config::ConfigService;
use crate::services::system_status::SystemStatusService;
use crate::services::environment_record::EnvironmentRecordService;
use crate::services::environment_discovery::EnvironmentDiscoveryService;
use crate::services::version_catalog::service::VersionCatalogService;
use crate::services::task_service::TaskService;

pub struct AppState {
    pub app_handle: AppHandle,
    pub config: Arc<Mutex<ConfigService>>,
    pub system_status: Arc<Mutex<SystemStatusService>>,
    pub environment_record: Arc<Mutex<EnvironmentRecordService>>,
    pub environment_discovery: Arc<Mutex<EnvironmentDiscoveryService>>,
    pub version_catalog: Arc<Mutex<VersionCatalogService>>,
    pub task: Arc<Mutex<TaskService>>,
}
