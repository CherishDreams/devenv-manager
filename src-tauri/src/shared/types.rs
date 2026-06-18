use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ── EnvironmentKind ──────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentKind {
    Java,
    Python,
    Conda,
    Go,
    Node,
    Nvm,
    Maven,
    Gradle,
    Cmake,
    Ninja,
    Cpp,
    Lua,
    Rust,
    Dotnet,
    Php,
    Ruby,
    Flutter,
    Android,
    Mysql,
    Postgresql,
    Mongodb,
    Redis,
    Sqlite,
}

impl std::fmt::Display for EnvironmentKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        let s = match self {
            Self::Java => "java",
            Self::Python => "python",
            Self::Conda => "conda",
            Self::Go => "go",
            Self::Node => "node",
            Self::Nvm => "nvm",
            Self::Maven => "maven",
            Self::Gradle => "gradle",
            Self::Cmake => "cmake",
            Self::Ninja => "ninja",
            Self::Cpp => "cpp",
            Self::Lua => "lua",
            Self::Rust => "rust",
            Self::Dotnet => "dotnet",
            Self::Php => "php",
            Self::Ruby => "ruby",
            Self::Flutter => "flutter",
            Self::Android => "android",
            Self::Mysql => "mysql",
            Self::Postgresql => "postgresql",
            Self::Mongodb => "mongodb",
            Self::Redis => "redis",
            Self::Sqlite => "sqlite",
        };
        write!(f, "{}", s)
    }
}

// ── Simple enums ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallScope {
    Global,
    Custom,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum TaskStatus {
    Queued,
    Running,
    Succeeded,
    Failed,
    Cancelled,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentManagementMode {
    Symlink,
    Direct,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum EnvironmentOwnership {
    Managed,
    Adopted,
    External,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum UninstallPolicy {
    DeleteDirectory,
    RemoveRecordOnly,
    Manual,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum InstallType {
    Archive,
    Installer,
}

#[allow(dead_code)]
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum VersionChannel {
    Lts,
    Stable,
    Current,
}

// ── Data structs ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VendorOption {
    pub id: String,
    pub name: String,
    pub homepage: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentDefinition {
    pub id: EnvironmentKind,
    pub name: String,
    pub group: String,
    pub description: String,
    pub logo_id: EnvironmentKind,
    pub accent_color: String,
    pub env_vars: Vec<String>,
    pub path_entries: Vec<String>,
    pub install_type: InstallType,
    pub vendors: Vec<VendorOption>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallRecord {
    pub id: String,
    pub environment: EnvironmentKind,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    pub version: String,
    pub install_path: String,
    pub scope: InstallScope,
    pub managed: bool,
    pub ownership: EnvironmentOwnership,
    pub uninstall_policy: UninstallPolicy,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub discovery_source: Option<String>,
    pub active: bool,
    pub env_vars: HashMap<String, String>,
    pub path_entries: Vec<String>,
    pub installed_at: String,
    pub updated_at: String,
}

pub type ActiveEnvironmentMap = HashMap<EnvironmentKind, String>;

// ── Installation Result ──────────────────────────────────────────────────────

#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationResult {
    pub install_path: String,
    pub resolved_version: String,
    pub env_vars: HashMap<String, String>,
    pub path_entries: Vec<String>,
    pub verification_output: String,
}

// ── Version Catalog ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AvailableVersion {
    pub id: String,
    pub environment: EnvironmentKind,
    pub vendor: String,
    pub version: String,
    pub label: String,
    pub channel: String,
    pub package_type: String,
    pub architecture: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VersionCatalogQuery {
    pub environment: EnvironmentKind,
    pub vendor: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentSummary {
    pub definitions: Vec<EnvironmentDefinition>,
    pub installations: Vec<InstallRecord>,
    pub active_by_kind: ActiveEnvironmentMap,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredEnvironment {
    pub id: String,
    pub environment: EnvironmentKind,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    pub version: String,
    pub install_path: String,
    pub env_vars: HashMap<String, String>,
    pub path_entries: Vec<String>,
    pub source: String,
    pub active: bool,
    pub already_managed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdoptEnvironmentInput {
    pub environment: EnvironmentKind,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    pub version: String,
    pub install_path: String,
    pub env_vars: HashMap<String, String>,
    pub path_entries: Vec<String>,
    pub source: String,
    pub active: bool,
    pub ownership: EnvironmentOwnership,
    pub uninstall_policy: UninstallPolicy,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentApplyPlan {
    pub env_vars: HashMap<String, String>,
    pub add_path_entries: Vec<String>,
    pub remove_path_entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentCleanupPlan {
    pub env_vars: HashMap<String, String>,
    pub remove_path_entries: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatabaseInstallConfig {
    pub enabled: bool,
    pub install_as_service: bool,
    pub start_service: bool,
    pub service_name: String,
    pub port: u16,
    pub bind_address: String,
    pub charset: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub collation: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallTaskInput {
    pub environment: EnvironmentKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub vendor: Option<String>,
    pub version: String,
    pub scope: InstallScope,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub install_path: Option<String>,
    pub configure_system_env: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub database_config: Option<DatabaseInstallConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskLogEntry {
    pub at: String,
    pub level: String, // "info" | "warn" | "error"
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskDownloadProgress {
    pub url: String,
    pub file_name: String,
    pub received_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub total_bytes: Option<u64>,
    pub bytes_per_second: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub percent: Option<f64>,
    pub updated_at: String,
    pub completed: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManagedTask {
    pub id: String,
    pub title: String,
    pub status: TaskStatus,
    pub progress: f64,
    pub created_at: String,
    pub updated_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub input: Option<InstallTaskInput>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download: Option<TaskDownloadProgress>,
    pub logs: Vec<TaskLogEntry>,
}

// ── Privilege Check ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "kebab-case")]
pub enum PrivilegeCheckInput {
    SetActive { environment: EnvironmentKind, id: String },
    Uninstall { id: String },
    Install { input: InstallTaskInput },
    Retry { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrivilegeRequirement {
    pub required: bool,
    pub reason: String,
    pub can_switch_to_symlink: bool,
    pub current_mode: EnvironmentManagementMode,
    pub authorization_mode: AuthorizationMode,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum AuthorizationMode {
    None,
    ElevatedHelper,
    RestartApp,
}
