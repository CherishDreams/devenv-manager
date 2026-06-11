use std::collections::HashMap;
use tokio::fs;
use crate::error::{AppError, AppResult};
use crate::shared::types::*;
use crate::shared::environment_definitions::environment_definitions;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct EnvironmentData {
    pub installations: Vec<InstallRecord>,
}

impl Default for EnvironmentData {
    fn default() -> Self {
        Self {
            installations: vec![],
        }
    }
}

/// Return deduplicated, non-empty strings preserving first-seen order.
pub fn unique(values: &[String]) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    values
        .iter()
        .filter(|v| !v.is_empty() && seen.insert(v.clone()))
        .cloned()
        .collect()
}

/// Look up the [EnvironmentDefinition] for a given [EnvironmentKind].
pub fn get_definition(environment: &EnvironmentKind) -> AppResult<EnvironmentDefinition> {
    environment_definitions()
        .into_iter()
        .find(|d| &d.id == environment)
        .ok_or_else(|| AppError::Message(format!("未知环境：{}", environment)))
}

fn get_record_ownership(record: &InstallRecord) -> EnvironmentOwnership {
    record.ownership.clone()
}

fn get_record_uninstall_policy(record: &InstallRecord) -> UninstallPolicy {
    record.uninstall_policy.clone()
}

/// Ensure derived fields (`managed`, `ownership`, `uninstall_policy`) are consistent.
pub fn normalize_install_record(mut record: InstallRecord) -> InstallRecord {
    let ownership = get_record_ownership(&record);
    record.managed = ownership == EnvironmentOwnership::Managed;
    record.ownership = ownership;
    record.uninstall_policy = get_record_uninstall_policy(&record);
    record
}

/// Build the environment-variable map that should be set for *definition* rooted at *root_path*.
pub fn get_env_vars(definition: &EnvironmentDefinition, root_path: &str) -> HashMap<String, String> {
    match definition.id {
        EnvironmentKind::Nvm => {
            let mut map = HashMap::new();
            map.insert("NVM_HOME".to_string(), root_path.to_string());
            map.insert("NVM_SYMLINK".to_string(), format!("{}\\nodejs", root_path));
            map
        }
        EnvironmentKind::Rust => {
            let mut map = HashMap::new();
            map.insert("CARGO_HOME".to_string(), format!("{}\\cargo", root_path));
            map.insert("RUSTUP_HOME".to_string(), format!("{}\\rustup", root_path));
            map
        }
        _ => definition
            .env_vars
            .iter()
            .map(|name| (name.clone(), root_path.to_string()))
            .collect(),
    }
}

/// Resolve the PATH entries for *definition* rooted at *root_path*.
///
/// An empty string in `path_entries` represents the root itself.
pub fn get_path_entries(definition: &EnvironmentDefinition, root_path: &str) -> Vec<String> {
    definition
        .path_entries
        .iter()
        .map(|entry| {
            if entry.is_empty() {
                root_path.to_string()
            } else {
                format!("{}\\{}", root_path, entry)
            }
        })
        .collect()
}

/// Return the path to the `.current/<environment>` symlink / junction.
pub fn get_current_link_path(
    config: &crate::services::config::AppConfig,
    environment: &EnvironmentKind,
) -> String {
    format!("{}\\.current\\{}", config.global_install_dir, environment)
}

/// Collect all PATH entries that should be present for a managed environment,
/// including per-record entries plus the stable (symlink-based) entries.
pub fn get_managed_path_entries(
    environment: &EnvironmentKind,
    records: &[InstallRecord],
    config: &crate::services::config::AppConfig,
) -> Vec<String> {
    let definition = match get_definition(environment) {
        Ok(d) => d,
        Err(_) => return vec![],
    };
    let link_path = get_current_link_path(config, environment);
    let stable_entries = get_path_entries(&definition, &link_path);

    let mut all: Vec<String> = records
        .iter()
        .flat_map(|r| r.path_entries.clone())
        .collect();
    all.extend(stable_entries);
    unique(&all)
}

/// Build a map of `environment -> record_id` for every active record.
pub fn get_active_by_kind(records: &[InstallRecord]) -> ActiveEnvironmentMap {
    let mut map = ActiveEnvironmentMap::new();
    for record in records {
        if record.active {
            map.insert(record.environment.clone(), record.id.clone());
        }
    }
    map
}

/// Check whether a filesystem path exists (async).
pub async fn path_exists(path: &str) -> bool {
    fs::metadata(path).await.is_ok()
}
