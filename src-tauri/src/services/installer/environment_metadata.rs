use std::collections::HashMap;
use std::path::Path;
use crate::error::{AppError, AppResult};
use crate::shared::types::*;
use crate::services::config::AppConfig;
use crate::shared::environment_definitions::environment_definitions;

/// Compute the install path based on scope and config.
pub fn get_install_path(config: &AppConfig, input: &InstallTaskInput, resolved_version: &str) -> String {
    match input.scope {
        InstallScope::Custom => {
            input
                .install_path
                .clone()
                .unwrap_or_else(|| String::new())
        }
        InstallScope::Global => {
            format!(
                "{}\\{}\\{}\\{}",
                config.global_install_dir,
                input.environment,
                input.vendor.as_deref().unwrap_or("default"),
                resolved_version
            )
        }
    }
}

/// Get path entries for a definition resolved to an install path.
pub fn get_path_entries(definition: &EnvironmentDefinition, install_path: &str) -> Vec<String> {
    definition
        .path_entries
        .iter()
        .map(|entry| {
            if entry.is_empty() {
                install_path.to_string()
            } else {
                format!("{}\\{}", install_path, entry)
            }
        })
        .collect()
}

/// Get environment variables for a definition resolved to an install path.
pub fn get_env_vars(
    definition: &EnvironmentDefinition,
    install_path: &str,
) -> HashMap<String, String> {
    match definition.id {
        EnvironmentKind::Nvm => {
            let mut map = HashMap::new();
            map.insert("NVM_HOME".to_string(), install_path.to_string());
            map.insert(
                "NVM_SYMLINK".to_string(),
                format!("{}\\nodejs", install_path),
            );
            map
        }
        EnvironmentKind::Rust => {
            let mut map = HashMap::new();
            map.insert(
                "CARGO_HOME".to_string(),
                format!("{}\\cargo", install_path),
            );
            map.insert(
                "RUSTUP_HOME".to_string(),
                format!("{}\\rustup", install_path),
            );
            map
        }
        _ => definition
            .env_vars
            .iter()
            .map(|name| (name.clone(), install_path.to_string()))
            .collect(),
    }
}

/// Get the verification command for a given environment.
pub fn get_verification_command(
    environment: &EnvironmentKind,
    install_path: &str,
) -> (String, Vec<String>) {
    let j = |parts: &[&str]| -> String {
        let mut p = Path::new(install_path).to_path_buf();
        for part in parts {
            p = p.join(part);
        }
        p.to_str().unwrap_or_default().to_string()
    };

    match environment {
        EnvironmentKind::Java => (j(&["bin", "java.exe"]), vec!["-version".into()]),
        EnvironmentKind::Python => (j(&["python.exe"]), vec!["--version".into()]),
        EnvironmentKind::Conda => (j(&["Scripts", "conda.exe"]), vec!["--version".into()]),
        EnvironmentKind::Go => (j(&["bin", "go.exe"]), vec!["version".into()]),
        EnvironmentKind::Node => (j(&["node.exe"]), vec!["--version".into()]),
        EnvironmentKind::Nvm => (j(&["nvm.exe"]), vec!["version".into()]),
        EnvironmentKind::Maven => (j(&["bin", "mvn.cmd"]), vec!["-version".into()]),
        EnvironmentKind::Gradle => (j(&["bin", "gradle.bat"]), vec!["--version".into()]),
        EnvironmentKind::Cmake => (j(&["bin", "cmake.exe"]), vec!["--version".into()]),
        EnvironmentKind::Ninja => (j(&["ninja.exe"]), vec!["--version".into()]),
        EnvironmentKind::Cpp => (j(&["bin", "clang++.exe"]), vec!["--version".into()]),
        EnvironmentKind::Lua => (j(&["lua.exe"]), vec!["-v".into()]),
        EnvironmentKind::Rust => (j(&["cargo", "bin", "rustc.exe"]), vec!["--version".into()]),
        EnvironmentKind::Dotnet => (j(&["dotnet.exe"]), vec!["--version".into()]),
        EnvironmentKind::Php => (j(&["php.exe"]), vec!["-v".into()]),
        EnvironmentKind::Ruby => (j(&["bin", "ruby.exe"]), vec!["-v".into()]),
        EnvironmentKind::Flutter => (j(&["bin", "flutter.bat"]), vec!["--version".into()]),
        EnvironmentKind::Android => (
            j(&["cmdline-tools", "bin", "sdkmanager.bat"]),
            vec!["--version".into()],
        ),
        EnvironmentKind::Mysql => (j(&["bin", "mysqld.exe"]), vec!["--version".into()]),
        EnvironmentKind::Postgresql => (j(&["bin", "postgres.exe"]), vec!["--version".into()]),
        EnvironmentKind::Mongodb => (j(&["bin", "mongod.exe"]), vec!["--version".into()]),
        EnvironmentKind::Redis => (j(&["redis-server.exe"]), vec!["--version".into()]),
        EnvironmentKind::Sqlite => (j(&["sqlite3.exe"]), vec!["--version".into()]),
    }
}

/// Compare two dotted version strings numerically.
pub fn compare_version(left: &str, right: &str) -> std::cmp::Ordering {
    let left_parts: Vec<i64> = left
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();
    let right_parts: Vec<i64> = right
        .split('.')
        .filter_map(|p| p.parse().ok())
        .collect();
    let len = left_parts.len().max(right_parts.len());

    for i in 0..len {
        let l = left_parts.get(i).copied().unwrap_or(0);
        let r = right_parts.get(i).copied().unwrap_or(0);
        match l.cmp(&r) {
            std::cmp::Ordering::Equal => continue,
            other => return other,
        }
    }
    std::cmp::Ordering::Equal
}

/// Look up the definition for a given environment kind.
pub fn get_definition(environment: &EnvironmentKind) -> AppResult<EnvironmentDefinition> {
    environment_definitions()
        .into_iter()
        .find(|d| &d.id == environment)
        .ok_or_else(|| AppError::Message(format!("未知环境：{}", environment)))
}
