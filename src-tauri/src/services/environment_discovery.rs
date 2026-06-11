#![allow(dead_code)]

use std::collections::{HashMap, HashSet};
use std::path::Path;
use tokio::process::Command;
use crate::error::AppResult;
use crate::shared::types::*;
use crate::shared::environment_definitions::environment_definitions;
use crate::services::config::{AppConfig, ConfigService};
use crate::services::environment_record::EnvironmentRecordService;
use crate::environment_records::helpers::*;

// ── Probe definition ─────────────────────────────────────────────────────────

struct Probe {
    environment: EnvironmentKind,
    commands: Vec<String>,
    root_from_executable: fn(&str) -> String,
    parse_version: fn(&str) -> Option<String>,
}

// ── Helpers ──────────────────────────────────────────────────────────────────

fn normalize_path(value: &str) -> String {
    let resolved = std::fs::canonicalize(value)
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| value.to_string());
    let resolved = resolved.strip_prefix("\\\\?\\").unwrap_or(&resolved);
    let normalized = resolved.replace('/', "\\");
    let trimmed = normalized.trim_end_matches('\\');
    trimmed.to_lowercase()
}

fn first_version(output: &str) -> Option<String> {
    // Match patterns like 1.2.3, 1.2.3.4, 1.2.3-beta.1
    let re_pattern = regex_simple_version(output);
    re_pattern
}

fn regex_simple_version(output: &str) -> Option<String> {
    // Simple version extraction: find first occurrence of digits.digits pattern
    let mut start = None;
    let mut dot_count = 0;

    for (i, c) in output.char_indices() {
        if c.is_ascii_digit() {
            if start.is_none() {
                start = Some(i);
            }
        } else if c == '.' && start.is_some() {
            dot_count += 1;
        } else if start.is_some() {
            if dot_count >= 1 {
                return Some(output[start.unwrap()..i].to_string());
            }
            start = None;
            dot_count = 0;
        }
    }
    if let Some(s) = start {
        if dot_count >= 1 {
            return Some(output[s..].to_string());
        }
    }
    None
}

fn is_path_inside(path: &str, root: &str) -> bool {
    let np = normalize_path(path);
    let nr = normalize_path(root);
    np == nr || np.starts_with(&format!("{}\\", nr))
}

fn is_windows_apps_path(path: &str) -> bool {
    path.to_lowercase().contains("windowsapps")
}

fn trim_executable_path(value: &str) -> Option<String> {
    let trimmed = value.trim();
    // Try quoted path: "path\to\file.exe"
    if trimmed.starts_with('"') {
        if let Some(end) = trimmed[1..].find('"') {
            let inner = &trimmed[1..1 + end];
            if inner.to_lowercase().ends_with(".exe") {
                return Some(inner.to_string());
            }
        }
        return None;
    }
    // Try unquoted: path\to\file.exe
    if let Some(pos) = trimmed.to_lowercase().find(".exe") {
        let end = pos + 4;
        // Take only the first token (up to whitespace)
        let candidate = &trimmed[..end];
        if !candidate.contains(' ') {
            return Some(candidate.to_string());
        }
    }
    None
}

async fn run_process(command: &str, args: &[&str]) -> Result<String, String> {
    let output = Command::new(command)
        .args(args)
        .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
        .output()
        .await
        .map_err(|e| format!("Failed to run {}: {}", command, e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    let combined = [stdout, stderr]
        .iter()
        .filter(|s| !s.is_empty())
        .cloned()
        .collect::<Vec<_>>()
        .join("\n");
    if output.status.success() || !combined.is_empty() {
        Ok(combined)
    } else {
        Err(format!("{} failed with status: {}", command, output.status))
    }
}

async fn find_executables(command: &str) -> Vec<String> {
    match run_process("where.exe", &[command]).await {
        Ok(output) => output
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| l.to_lowercase().ends_with(&command.to_lowercase()))
            .collect(),
        Err(_) => vec![],
    }
}

// ── Probe factory ────────────────────────────────────────────────────────────

fn parent_of_bin(executable_path: &str) -> String {
    let p = Path::new(executable_path);
    p.parent().and_then(|b| b.parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| executable_path.to_string())
}

fn executable_dir(executable_path: &str) -> String {
    Path::new(executable_path)
        .parent()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| executable_path.to_string())
}

fn rust_root(executable_path: &str) -> String {
    let p = Path::new(executable_path);
    p.parent().and_then(|d| d.parent()).and_then(|d| d.parent())
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|| executable_path.to_string())
}

fn create_probes() -> HashMap<EnvironmentKind, Probe> {
    let mut map = HashMap::new();

    map.insert(EnvironmentKind::Java, Probe {
        environment: EnvironmentKind::Java,
        commands: vec!["java.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("version \"")
                .and_then(|i| {
                    let start = i + 9;
                    output[start..].find('"').map(|j| output[start..start + j].to_string())
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Python, Probe {
        environment: EnvironmentKind::Python,
        commands: vec!["python.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Conda, Probe {
        environment: EnvironmentKind::Conda,
        commands: vec!["conda.exe".into()],
        root_from_executable: |exe| {
            let dir = executable_dir(exe);
            let last = Path::new(&dir).file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            if ["Scripts", "condabin"].contains(&last.as_str()) {
                Path::new(&dir).parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(dir)
            } else {
                dir
            }
        },
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Go, Probe {
        environment: EnvironmentKind::Go,
        commands: vec!["go.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("go version go")
                .map(|i| {
                    let start = i + 13;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Node, Probe {
        environment: EnvironmentKind::Node,
        commands: vec!["node.exe".into()],
        root_from_executable: executable_dir,
        parse_version: |output| {
            output.trim().strip_prefix('v')
                .or(Some(output.trim()))
                .and_then(|s| {
                    // Extract x.y.z
                    let mut end = 0;
                    let mut dots = 0;
                    for (i, c) in s.char_indices() {
                        if c == '.' { dots += 1; }
                        else if !c.is_ascii_digit() { break; }
                        end = i + 1;
                        if dots == 2 {
                            // Check if next char is digit
                            if i + 1 < s.len() && s.as_bytes()[i + 1].is_ascii_digit() {
                                continue;
                            }
                            break;
                        }
                    }
                    if end > 0 { Some(s[..end].to_string()) } else { None }
                })
        },
    });

    map.insert(EnvironmentKind::Nvm, Probe {
        environment: EnvironmentKind::Nvm,
        commands: vec!["nvm.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Maven, Probe {
        environment: EnvironmentKind::Maven,
        commands: vec!["mvn.cmd".into(), "mvn.bat".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("Apache Maven ")
                .map(|i| {
                    let start = i + 13;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Gradle, Probe {
        environment: EnvironmentKind::Gradle,
        commands: vec!["gradle.bat".into(), "gradle.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("Gradle ")
                .map(|i| {
                    let start = i + 7;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Cmake, Probe {
        environment: EnvironmentKind::Cmake,
        commands: vec!["cmake.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            let lower = output.to_lowercase();
            lower.find("cmake version")
                .map(|i| {
                    let start = i + 14;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Ninja, Probe {
        environment: EnvironmentKind::Ninja,
        commands: vec!["ninja.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Cpp, Probe {
        environment: EnvironmentKind::Cpp,
        commands: vec!["clang++.exe".into(), "g++.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("clang version ")
                .map(|i| {
                    let start = i + 14;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Rust, Probe {
        environment: EnvironmentKind::Rust,
        commands: vec!["rustc.exe".into(), "cargo.exe".into()],
        root_from_executable: rust_root,
        parse_version: |output| {
            output.find("rustc ")
                .map(|i| {
                    let start = i + 6;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Dotnet, Probe {
        environment: EnvironmentKind::Dotnet,
        commands: vec!["dotnet.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Php, Probe {
        environment: EnvironmentKind::Php,
        commands: vec!["php.exe".into()],
        root_from_executable: executable_dir,
        parse_version: |output| {
            output.find("PHP ")
                .map(|i| {
                    let start = i + 4;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Ruby, Probe {
        environment: EnvironmentKind::Ruby,
        commands: vec!["ruby.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("ruby ")
                .map(|i| {
                    let start = i + 5;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Flutter, Probe {
        environment: EnvironmentKind::Flutter,
        commands: vec!["flutter.bat".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("Flutter ")
                .map(|i| {
                    let start = i + 8;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Android, Probe {
        environment: EnvironmentKind::Android,
        commands: vec!["sdkmanager.bat".into(), "adb.exe".into()],
        root_from_executable: |exe| {
            let dir = executable_dir(exe);
            if dir.to_lowercase().ends_with("platform-tools") {
                Path::new(&dir).parent()
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(dir)
            } else {
                Path::new(&dir).parent()
                    .and_then(|p| p.parent())
                    .map(|p| p.to_string_lossy().to_string())
                    .unwrap_or(dir)
            }
        },
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Lua, Probe {
        environment: EnvironmentKind::Lua,
        commands: vec!["lua.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map.insert(EnvironmentKind::Mysql, Probe {
        environment: EnvironmentKind::Mysql,
        commands: vec!["mysqld.exe".into(), "mysql.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("Ver ")
                .map(|i| {
                    let start = i + 4;
                    let s = &output[start..];
                    let end = s.find(|c: char| !c.is_ascii_digit() && c != '.')
                        .unwrap_or(s.len());
                    s[..end].to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Postgresql, Probe {
        environment: EnvironmentKind::Postgresql,
        commands: vec!["postgres.exe".into(), "psql.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("PostgreSQL")
                .and_then(|i| {
                    // Look for version number after "PostgreSQL" or "PostgreSQL)"
                    let rest = &output[i..];
                    let start = rest.find(|c: char| c.is_ascii_digit())?;
                    let s = &rest[start..];
                    let end = s.find(|c: char| !c.is_ascii_digit() && c != '.')
                        .unwrap_or(s.len());
                    Some(s[..end].to_string())
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Mongodb, Probe {
        environment: EnvironmentKind::Mongodb,
        commands: vec!["mongod.exe".into(), "mongo.exe".into(), "mongosh.exe".into()],
        root_from_executable: parent_of_bin,
        parse_version: |output| {
            output.find("db version v")
                .or(output.find("db version "))
                .map(|i| {
                    let start = if output[i..].starts_with("db version v") { i + 12 } else { i + 11 };
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Redis, Probe {
        environment: EnvironmentKind::Redis,
        commands: vec!["redis-server.exe".into(), "redis-cli.exe".into()],
        root_from_executable: executable_dir,
        parse_version: |output| {
            output.find("v=")
                .map(|i| {
                    let start = i + 2;
                    output[start..].split_whitespace().next()
                        .unwrap_or(&output[start..])
                        .to_string()
                })
                .or_else(|| first_version(output))
        },
    });

    map.insert(EnvironmentKind::Sqlite, Probe {
        environment: EnvironmentKind::Sqlite,
        commands: vec!["sqlite3.exe".into()],
        root_from_executable: executable_dir,
        parse_version: first_version,
    });

    map
}

// ── Discovery context ────────────────────────────────────────────────────────

struct DiscoveryContext {
    existing_paths: HashSet<String>,
    excluded_roots: HashSet<String>,
}

fn create_existing_path_set(summary: &EnvironmentSummary) -> HashSet<String> {
    summary.installations.iter()
        .map(|r| normalize_path(&r.install_path))
        .collect()
}

fn create_discovery_exclusion_roots(summary: &EnvironmentSummary, config: &AppConfig) -> HashSet<String> {
    let mut roots = HashSet::new();
    let current_base = format!("{}\\.current", config.global_install_dir);
    roots.insert(normalize_path(&current_base));

    for def in environment_definitions() {
        let link_path = get_current_link_path(config, &def.id);
        roots.insert(normalize_path(&link_path));
        for entry in get_path_entries(&def, &link_path) {
            roots.insert(normalize_path(&entry));
        }
    }

    for record in &summary.installations {
        roots.insert(normalize_path(&record.install_path));
        for entry in &record.path_entries {
            roots.insert(normalize_path(entry));
        }
        for value in record.env_vars.values() {
            roots.insert(normalize_path(value));
        }
    }

    roots
}

// ── Database service discovery ───────────────────────────────────────────────

#[derive(Debug, serde::Deserialize)]
struct ServiceInfo {
    #[serde(rename = "Name")]
    name: Option<String>,
    #[serde(rename = "DisplayName")]
    display_name: Option<String>,
    #[serde(rename = "PathName")]
    path_name: Option<String>,
}

async fn list_database_services() -> Vec<ServiceInfo> {
    let command = concat!(
        "$ErrorActionPreference='SilentlyContinue';",
        "$items = Get-CimInstance Win32_Service | Where-Object { $_.Name -match 'mysql|postgres|postgresql|mongo|mongodb|redis' -or $_.DisplayName -match 'mysql|postgres|postgresql|mongo|mongodb|redis' } | Select-Object Name,DisplayName,PathName;",
        "$items | ConvertTo-Json -Compress"
    );

    match run_process("powershell.exe", &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", command]).await {
        Ok(output) => {
            if output.trim().is_empty() {
                return vec![];
            }
            // Try parsing as array first, then single object
            if let Ok(arr) = serde_json::from_str::<Vec<ServiceInfo>>(&output) {
                return arr;
            }
            if let Ok(single) = serde_json::from_str::<ServiceInfo>(&output) {
                return vec![single];
            }
            vec![]
        }
        Err(_) => vec![],
    }
}

// ── Service ──────────────────────────────────────────────────────────────────

pub struct EnvironmentDiscoveryService {
    probes: HashMap<EnvironmentKind, Probe>,
    environment_record_service: std::sync::Arc<tokio::sync::Mutex<EnvironmentRecordService>>,
    config_service: std::sync::Arc<tokio::sync::Mutex<ConfigService>>,
}

impl EnvironmentDiscoveryService {
    pub fn new(
        environment_record_service: std::sync::Arc<tokio::sync::Mutex<EnvironmentRecordService>>,
        config_service: std::sync::Arc<tokio::sync::Mutex<ConfigService>>,
    ) -> Self {
        Self {
            probes: create_probes(),
            environment_record_service,
            config_service,
        }
    }

    pub async fn discover(&self) -> AppResult<Vec<DiscoveredEnvironment>> {
        let summary = self.environment_record_service.lock().await.get_summary().await?;
        let config = self.config_service.lock().await.get().await?;
        let context = DiscoveryContext {
            existing_paths: create_existing_path_set(&summary),
            excluded_roots: create_discovery_exclusion_roots(&summary, &config),
        };

        let mut discovered: HashMap<String, DiscoveredEnvironment> = HashMap::new();

        for definition in environment_definitions() {
            let probe = match self.probes.get(&definition.id) {
                Some(p) => p,
                None => continue,
            };

            // Check environment variables
            for env_var in &definition.env_vars {
                if let Ok(value) = std::env::var(env_var) {
                    self.add_candidate(
                        &mut discovered,
                        probe,
                        &value,
                        &format!("{} 环境变量", env_var),
                        true,
                        &context,
                    ).await;
                }
            }

            // Check PATH commands
            for command in &probe.commands {
                let executable_paths = find_executables(command).await;
                for exe_path in executable_paths {
                    let root = (probe.root_from_executable)(&exe_path);
                    self.add_candidate(
                        &mut discovered,
                        probe,
                        &root,
                        &format!("Path 命令：{}", command),
                        false,
                        &context,
                    ).await;
                }
            }
        }

        // Database service discovery
        self.add_database_service_candidates(&mut discovered, &context).await;

        let mut result: Vec<DiscoveredEnvironment> = discovered.into_values().collect();
        result.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(result)
    }

    async fn add_database_service_candidates(
        &self,
        discovered: &mut HashMap<String, DiscoveredEnvironment>,
        context: &DiscoveryContext,
    ) {
        let services = list_database_services().await;
        for service in services {
            let exe_path = service.path_name.as_deref()
                .and_then(|p| trim_executable_path(p));
            let exe_path = match exe_path {
                Some(p) => p,
                None => continue,
            };

            let lower = exe_path.to_lowercase();
            let environment = if lower.contains("postgres") {
                Some(EnvironmentKind::Postgresql)
            } else if lower.contains("mysql") {
                Some(EnvironmentKind::Mysql)
            } else if lower.contains("mongo") {
                Some(EnvironmentKind::Mongodb)
            } else if lower.contains("redis") {
                Some(EnvironmentKind::Redis)
            } else {
                None
            };

            let kind = match environment {
                Some(k) => k,
                None => continue,
            };

            let probe = match self.probes.get(&kind) {
                Some(p) => p,
                None => continue,
            };

            let root = (probe.root_from_executable)(&exe_path);
            let kind_string = kind.to_string();
            let display = service.display_name.as_deref()
                .or(service.name.as_deref())
                .unwrap_or(&kind_string);
            let source = format!("Windows 服务：{}", display);

            self.add_candidate(discovered, probe, &root, &source, true, context).await;
        }
    }

    async fn add_candidate(
        &self,
        discovered: &mut HashMap<String, DiscoveredEnvironment>,
        probe: &Probe,
        root_path: &str,
        source: &str,
        active: bool,
        context: &DiscoveryContext,
    ) {
        // Normalize candidate root
        let install_path = self.normalize_candidate_root(probe, root_path).await;
        let normalized = normalize_path(&install_path);
        let key = format!("{}:{}", probe.environment, normalized);

        // Check exclusions
        if discovered.contains_key(&key)
            || is_windows_apps_path(&install_path)
            || self.is_excluded_root(&install_path, &context.excluded_roots)
        {
            return;
        }

        if !path_exists(&install_path).await {
            return;
        }

        let definition = match get_definition(&probe.environment) {
            Ok(d) => d,
            Err(_) => return,
        };

        // Build verification command path
        let verify_cmd = if install_path.ends_with('\\') || install_path.ends_with('/') {
            format!("{}bin\\{}", install_path, probe.commands.first().unwrap_or(&String::new()))
        } else {
            // Use the definition's path entries to build verify path
            let bin_dir = definition.path_entries.first()
                .filter(|e| !e.is_empty())
                .map(|e| format!("{}\\{}", install_path, e))
                .unwrap_or_else(|| install_path.clone());
            format!("{}\\{}", bin_dir, probe.commands.first().unwrap_or(&String::new()))
        };

        if !path_exists(&verify_cmd).await {
            return;
        }

        // Parse version
        let version = match run_process(&verify_cmd, &self.verify_args(probe)).await {
            Ok(output) => (probe.parse_version)(&output).unwrap_or_else(|| "未知版本".to_string()),
            Err(_) => return, // Skip if verification fails
        };

        let env_vars = get_env_vars(&definition, &install_path);
        let path_entries = get_path_entries(&definition, &install_path);
        let already_managed = context.existing_paths.contains(&normalized);

        discovered.insert(key, DiscoveredEnvironment {
            id: format!("{}:{}", probe.environment, normalized),
            environment: probe.environment.clone(),
            name: definition.name,
            vendor: None,
            version,
            install_path,
            env_vars,
            path_entries,
            source: source.to_string(),
            active,
            already_managed,
        });
    }

    async fn normalize_candidate_root(&self, probe: &Probe, root_path: &str) -> String {
        let mut install_path = std::fs::canonicalize(root_path)
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or_else(|_| root_path.to_string());
        if let Some(stripped) = install_path.strip_prefix("\\\\?\\") {
            install_path = stripped.to_string();
        }

        // Special case for Java: if root ends with "jre", check if parent has bin/java.exe
        if probe.environment == EnvironmentKind::Java {
            let lower = install_path.to_lowercase();
            if lower.ends_with("\\jre") || lower.ends_with("/jre") {
                if let Some(parent) = Path::new(&install_path).parent() {
                    let java_exe = parent.join("bin").join("java.exe");
                    if java_exe.exists() {
                        return parent.to_string_lossy().to_string();
                    }
                }
            }
        }

        install_path
    }

    fn is_excluded_root(&self, path: &str, excluded_roots: &HashSet<String>) -> bool {
        let normalized = normalize_path(path);
        excluded_roots.iter().any(|root| {
            normalized == *root || normalized.starts_with(&format!("{}\\", root))
        })
    }

    fn verify_args(&self, probe: &Probe) -> Vec<&str> {
        match probe.environment {
            EnvironmentKind::Java => vec!["-version"],
            EnvironmentKind::Python => vec!["--version"],
            EnvironmentKind::Conda => vec!["--version"],
            EnvironmentKind::Go => vec!["version"],
            EnvironmentKind::Node => vec!["--version"],
            EnvironmentKind::Nvm => vec!["version"],
            EnvironmentKind::Maven => vec!["-version"],
            EnvironmentKind::Gradle => vec!["--version"],
            EnvironmentKind::Cmake => vec!["-version"],
            EnvironmentKind::Ninja => vec!["--version"],
            EnvironmentKind::Cpp => vec!["-version"],
            EnvironmentKind::Rust => vec!["--version"],
            EnvironmentKind::Dotnet => vec!["--version"],
            EnvironmentKind::Php => vec!["-v"],
            EnvironmentKind::Ruby => vec!["-v"],
            EnvironmentKind::Flutter => vec!["--version"],
            EnvironmentKind::Android => vec!["--version"],
            EnvironmentKind::Lua => vec!["-v"],
            EnvironmentKind::Mysql => vec!["--version"],
            EnvironmentKind::Postgresql => vec!["--version"],
            EnvironmentKind::Mongodb => vec!["--version"],
            EnvironmentKind::Redis => vec!["--version"],
            EnvironmentKind::Sqlite => vec!["--version"],
        }
    }
}
