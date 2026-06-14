use std::collections::HashMap;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;
use crate::error::{AppError, AppResult};
use crate::shared::types::*;
use crate::shared::environment_definitions::environment_definitions;
use crate::services::config::{AppConfig, ConfigService};
use crate::environment_records::helpers::*;
use crate::environment_records::registry;
use super::json_file_store::JsonFileStore;

// ── Input types ──────────────────────────────────────────────────────────────

/// Parameters for adding a new managed install (downloaded & managed by us).
#[derive(Debug, Clone)]
pub struct AddManagedInstallInput {
    pub environment: EnvironmentKind,
    pub name: String,
    pub vendor: Option<String>,
    pub version: String,
    pub install_path: String,
    pub scope: InstallScope,
    pub active: bool,
    pub env_vars: HashMap<String, String>,
    pub path_entries: Vec<String>,
}

// ── Service ──────────────────────────────────────────────────────────────────

pub struct EnvironmentRecordService {
    store: JsonFileStore<EnvironmentData>,
    app_handle: AppHandle,
    config_service: std::sync::Arc<tokio::sync::Mutex<ConfigService>>,
}

impl EnvironmentRecordService {
    // ── Construction ─────────────────────────────────────────────────────

    pub fn new(
        app_handle: AppHandle,
        config_service: std::sync::Arc<tokio::sync::Mutex<ConfigService>>,
    ) -> AppResult<Self> {
        let data_path = app_handle
            .path()
            .resolve("environments.json", BaseDirectory::AppData)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        Ok(Self {
            store: JsonFileStore::new(data_path, EnvironmentData::default()),
            app_handle,
            config_service,
        })
    }

    // ── Internal data access ─────────────────────────────────────────────

    /// Read the store and normalize every record.
    async fn read_data(&self) -> AppResult<EnvironmentData> {
        let data = self.store.read().await?;
        Ok(EnvironmentData {
            installations: data
                .installations
                .into_iter()
                .map(normalize_install_record)
                .collect(),
        })
    }

    // ── Public API ───────────────────────────────────────────────────────

    /// Return a full summary of all definitions, installations, and active mappings.
    pub async fn get_summary(&self) -> AppResult<EnvironmentSummary> {
        let data = self.read_data().await?;
        Ok(EnvironmentSummary {
            definitions: environment_definitions(),
            installations: data.installations.clone(),
            active_by_kind: get_active_by_kind(&data.installations),
        })
    }

    // ── Planned: elevation support for admin-privileged operations ──
    #[allow(dead_code)]
    /// Synchronize the current process' environment variables with the registry
    /// so that child processes inherit the correct values.
    pub async fn synchronize_process_env(&self) -> AppResult<()> {
        let config = self.config_service.lock().await.get().await?;
        let scope = config.environment_management.env_scope.clone();
        let defs = environment_definitions();
        let names: Vec<String> = unique(
            &defs
                .iter()
                .flat_map(|d| d.env_vars.clone())
                .collect::<Vec<_>>(),
        );
        registry::synchronize_process_env(&scope, &names).await
    }

    // ── Elevation checks ─────────────────────────────────────────────────

    #[allow(dead_code)]
    pub async fn requires_elevation_for_install(
        &self,
        environment: &EnvironmentKind,
    ) -> AppResult<bool> {
        let config = self.config_service.lock().await.get().await?;
        if config.environment_management.mode == "direct" {
            return Ok(true);
        }
        let data = self.read_data().await?;
        let definition = get_definition(environment)?;
        let link_path = get_current_link_path(&config, environment);
        let scope = config.environment_management.env_scope.as_str();
        registry::registry_needs_update(scope, &EnvironmentApplyPlan {
            env_vars: get_env_vars(&definition, &link_path),
            add_path_entries: get_path_entries(&definition, &link_path),
            remove_path_entries: get_managed_path_entries(
                environment,
                &data.installations,
                &config,
            ),
        })
        .await
    }

    #[allow(dead_code)]
    pub async fn requires_elevation_for_set_active(
        &self,
        environment: &EnvironmentKind,
        id: &str,
    ) -> AppResult<bool> {
        let data = self.read_data().await?;
        let selected = self.get_selected_record(&data.installations, environment, id)?;
        let env_records: Vec<_> = data
            .installations
            .iter()
            .filter(|r| &r.environment == environment)
            .cloned()
            .collect();
        let config = self.config_service.lock().await.get().await?;
        let scope = config.environment_management.env_scope.as_str();
        registry::registry_needs_update(scope, &self.create_apply_plan(&selected, &env_records, &config))
            .await
    }

    #[allow(dead_code)]
    pub async fn requires_elevation_for_uninstall(&self, id: &str) -> AppResult<bool> {
        let data = self.read_data().await?;
        let record = match data.installations.iter().find(|r| r.id == id) {
            Some(r) => r.clone(),
            None => return Ok(false),
        };
        let config = self.config_service.lock().await.get().await?;
        let scope = config.environment_management.env_scope.as_str();
        let remaining: Vec<_> = data
            .installations
            .iter()
            .filter(|r| r.id != id)
            .cloned()
            .collect();
        let remaining_same: Vec<_> = remaining
            .iter()
            .filter(|r| r.environment == record.environment)
            .cloned()
            .collect();
        let replacement = if record.active {
            remaining_same.first().cloned()
        } else {
            None
        };
        let should_delete = record.uninstall_policy == UninstallPolicy::DeleteDirectory;

        if let Some(ref replacement) = replacement {
            return registry::registry_needs_update(
                scope,
                &self.create_apply_plan(replacement, &remaining_same, &config),
            )
            .await;
        }
        if !should_delete {
            return Ok(false);
        }
        registry::registry_needs_cleanup(
            scope,
            &self.create_cleanup_plan(&record, &remaining_same, &data.installations, &config),
        )
        .await
    }

    // ── Mutations ────────────────────────────────────────────────────────

    /// Switch the active version for a given environment kind.
    pub async fn set_active(
        &self,
        environment: &EnvironmentKind,
        id: &str,
    ) -> AppResult<EnvironmentSummary> {
        let data = self.read_data().await?;
        let selected = self.get_selected_record(&data.installations, environment, id)?;
        let env_records: Vec<_> = data
            .installations
            .iter()
            .filter(|r| &r.environment == environment)
            .cloned()
            .collect();

        self.apply_active_environment(&selected, &env_records).await?;

        let now = chrono::Utc::now().to_rfc3339();
        let id_owned = id.to_string();
        let environment_owned = environment.clone();
        self.store
            .update(|mut current| {
                current.installations = current
                    .installations
                    .into_iter()
                    .map(|mut r| {
                        if r.environment == environment_owned {
                            r.active = r.id == id_owned;
                            r.updated_at = now.clone();
                        }
                        r
                    })
                    .collect();
                current
            })
            .await?;

        self.get_summary().await
    }

    /// Add a new managed install record (created after a successful download / install).
    ///
    /// The record is persisted **before** applying system environment changes so that
    /// even if symlink / registry operations fail the installation record is not lost.
    pub async fn add_managed_install(
        &self,
        input: AddManagedInstallInput,
    ) -> AppResult<InstallRecord> {
        let now = chrono::Utc::now().to_rfc3339();
        let _current_data = self.read_data().await?;

        let record = InstallRecord {
            id: uuid::Uuid::new_v4().to_string(),
            environment: input.environment.clone(),
            name: input.name,
            vendor: input.vendor,
            version: input.version,
            install_path: input.install_path,
            scope: input.scope,
            managed: true,
            ownership: EnvironmentOwnership::Managed,
            uninstall_policy: UninstallPolicy::DeleteDirectory,
            discovery_source: None,
            active: input.active,
            env_vars: input.env_vars,
            path_entries: input.path_entries,
            installed_at: now.clone(),
            updated_at: now,
        };

        // Step 1 – persist the record FIRST so it is never lost.
        let active_env = input.environment.clone();
        let is_active = input.active;
        let record_clone = record.clone();
        self.store
            .update(|mut current| {
                let mut installations = vec![record_clone.clone()];
                for mut item in current.installations {
                    if is_active && item.environment == active_env {
                        item.active = false;
                    }
                    installations.push(item);
                }
                current.installations = installations;
                current
            })
            .await?;

        // Step 2 – apply system environment (symlink + registry).
        // This is allowed to fail without losing the record.
        if input.active {
            let updated_data = self.read_data().await?;
            let records_with_new: Vec<_> = std::iter::once(record.clone())
                .chain(
                    updated_data
                        .installations
                        .iter()
                        .filter(|i| i.environment == input.environment && i.id != record.id)
                        .cloned(),
                )
                .collect();
            if let Err(e) = self.apply_active_environment(&record, &records_with_new).await {
                eprintln!(
                    "Warning: failed to apply active environment for {} (record saved): {}",
                    record.id, e
                );
            }
        }

        Ok(record)
    }

    /// Adopt one or more externally-existing installations into the managed set.
    pub async fn adopt_existing_installs(
        &self,
        inputs: Vec<AdoptEnvironmentInput>,
    ) -> AppResult<EnvironmentSummary> {
        let now = chrono::Utc::now().to_rfc3339();

        let adopted: Vec<InstallRecord> = inputs
            .into_iter()
            .map(|input| InstallRecord {
                id: uuid::Uuid::new_v4().to_string(),
                environment: input.environment,
                name: input.name,
                vendor: input.vendor,
                version: input.version,
                install_path: input.install_path,
                scope: InstallScope::Custom,
                managed: false,
                ownership: input.ownership,
                uninstall_policy: input.uninstall_policy,
                discovery_source: Some(input.source),
                active: input.active,
                env_vars: input.env_vars,
                path_entries: input.path_entries,
                installed_at: now.clone(),
                updated_at: now.clone(),
            })
            .collect();

        let adopted_clone = adopted.clone();
        self.store
            .update(|mut current| {
                let normalized: Vec<_> = current
                    .installations
                    .into_iter()
                    .map(normalize_install_record)
                    .collect();
                let mut installations: Vec<InstallRecord> = adopted_clone.clone();
                for record in normalized {
                    // If an adopted record is taking over as active for this
                    // environment kind, deactivate the old one.
                    let has_replacement = adopted_clone
                        .iter()
                        .any(|a| a.active && a.environment == record.environment);
                    let record = if has_replacement {
                        InstallRecord {
                            active: false,
                            ..record
                        }
                    } else {
                        record
                    };
                    installations.push(record);
                }
                current.installations = installations;
                current
            })
            .await?;

        self.get_summary().await
    }

    /// Uninstall (or deregister) a managed install by id.
    pub async fn uninstall_managed(&self, id: &str) -> AppResult<EnvironmentSummary> {
        let data = self.read_data().await?;
        let record = data
            .installations
            .iter()
            .find(|r| r.id == id)
            .ok_or_else(|| AppError::Message("未找到要卸载的环境。".to_string()))?
            .clone();

        let config = self.config_service.lock().await.get().await?;
        let remaining: Vec<_> = data
            .installations
            .iter()
            .filter(|r| r.id != id)
            .cloned()
            .collect();
        let remaining_same: Vec<_> = remaining
            .iter()
            .filter(|r| r.environment == record.environment)
            .cloned()
            .collect();
        let replacement = if record.active {
            remaining_same.first().cloned()
        } else {
            None
        };
        let should_delete = record.uninstall_policy == UninstallPolicy::DeleteDirectory;

        // Apply env-changes for the replacement or clean up if nothing replaces.
        if let Some(ref replacement) = replacement {
            self.apply_active_environment(replacement, &remaining_same)
                .await?;
        } else if should_delete {
            self.cleanup_removed_record(&record, &remaining_same, &data.installations, &config)
                .await?;
        }

        // Delete the on-disk directory if the policy says so.
        if should_delete {
            let _ = tokio::fs::remove_dir_all(&record.install_path).await;
        }

        // Persist: remove the record and promote the replacement to active.
        let id_owned = id.to_string();
        let replacement_id = replacement.as_ref().map(|r| r.id.clone());
        let now = chrono::Utc::now().to_rfc3339();
        self.store
            .update(|mut current| {
                current.installations = current
                    .installations
                    .into_iter()
                    .filter(|r| r.id != id_owned)
                    .map(|mut r| {
                        if let Some(ref rep_id) = replacement_id {
                            if r.id == *rep_id {
                                r.active = true;
                                r.updated_at = now.clone();
                            }
                        }
                        r
                    })
                    .collect();
                current
            })
            .await?;

        self.get_summary().await
    }

    // ── Private helpers ──────────────────────────────────────────────────

    /// Find a specific record by id + environment kind.
    fn get_selected_record(
        &self,
        records: &[InstallRecord],
        environment: &EnvironmentKind,
        id: &str,
    ) -> AppResult<InstallRecord> {
        records
            .iter()
            .find(|r| r.id == id)
            .filter(|r| &r.environment == environment)
            .cloned()
            .ok_or_else(|| AppError::Message("未找到要切换的环境版本。".to_string()))
    }

    /// Build the [EnvironmentApplyPlan] for making *record* the active version.
    fn create_apply_plan(
        &self,
        record: &InstallRecord,
        records: &[InstallRecord],
        config: &AppConfig,
    ) -> EnvironmentApplyPlan {
        if config.environment_management.mode == "direct" {
            return EnvironmentApplyPlan {
                env_vars: record.env_vars.clone(),
                add_path_entries: unique(&record.path_entries),
                remove_path_entries: get_managed_path_entries(
                    &record.environment,
                    records,
                    config,
                ),
            };
        }
        // symlink mode – point env vars / PATH at the stable link path.
        let definition = match get_definition(&record.environment) {
            Ok(d) => d,
            Err(_) => {
                return EnvironmentApplyPlan {
                    env_vars: HashMap::new(),
                    add_path_entries: vec![],
                    remove_path_entries: vec![],
                }
            }
        };
        let link_path = get_current_link_path(config, &record.environment);
        EnvironmentApplyPlan {
            env_vars: get_env_vars(&definition, &link_path),
            add_path_entries: get_path_entries(&definition, &link_path),
            remove_path_entries: get_managed_path_entries(
                &record.environment,
                records,
                config,
            ),
        }
    }

    /// Build the [EnvironmentCleanupPlan] for fully removing *record*.
    fn create_cleanup_plan(
        &self,
        record: &InstallRecord,
        remaining_same: &[InstallRecord],
        all_records: &[InstallRecord],
        config: &AppConfig,
    ) -> EnvironmentCleanupPlan {
        if config.environment_management.mode == "direct" {
            return EnvironmentCleanupPlan {
                env_vars: record.env_vars.clone(),
                remove_path_entries: record.path_entries.clone(),
            };
        }
        // If other versions still exist for this environment kind we only need
        // to remove the per-record PATH entries; the stable link will be
        // repointed to the replacement.
        if !remaining_same.is_empty() {
            return EnvironmentCleanupPlan {
                env_vars: HashMap::new(),
                remove_path_entries: record.path_entries.clone(),
            };
        }
        // Last version – clean up everything.
        let definition = match get_definition(&record.environment) {
            Ok(d) => d,
            Err(_) => {
                return EnvironmentCleanupPlan {
                    env_vars: HashMap::new(),
                    remove_path_entries: vec![],
                }
            }
        };
        let link_path = get_current_link_path(config, &record.environment);
        EnvironmentCleanupPlan {
            env_vars: get_env_vars(&definition, &link_path),
            remove_path_entries: get_managed_path_entries(
                &record.environment,
                all_records,
                config,
            ),
        }
    }

    /// Apply environment changes to make *record* the active version.
    ///
    /// 1. In symlink mode, repoint the `.current/<env>` junction.
    /// 2. Write the registry (env vars + PATH) via the registry module.
    async fn apply_active_environment(
        &self,
        record: &InstallRecord,
        records: &[InstallRecord],
    ) -> AppResult<()> {
        let config = self.config_service.lock().await.get().await?;

        // Step 1 – repoint the junction in symlink mode.
        if config.environment_management.mode == "symlink" {
            self.replace_current_link(record, &config).await?;
        }

        // Step 2 – update the Windows registry.
        let scope = config.environment_management.env_scope.as_str();
        let plan = self.create_apply_plan(record, records, &config);
        registry::apply_registry_plan(&self.app_handle, scope, &plan).await?;

        Ok(())
    }

    /// Remove registry entries (and optionally the junction) for a record that
    /// is being fully removed with no replacement.
    async fn cleanup_removed_record(
        &self,
        record: &InstallRecord,
        remaining_same: &[InstallRecord],
        all_records: &[InstallRecord],
        config: &AppConfig,
    ) -> AppResult<()> {
        let scope = config.environment_management.env_scope.as_str();
        let plan = self.create_cleanup_plan(record, remaining_same, all_records, config);
        registry::cleanup_registry_plan(&self.app_handle, scope, &plan).await?;

        // In symlink mode, remove the junction if no other versions remain.
        if config.environment_management.mode == "symlink" && remaining_same.is_empty() {
            let link_path = get_current_link_path(config, &record.environment);
            if path_exists(&link_path).await {
                // Junctions are removed by deleting the directory entry.
                let _ = tokio::fs::remove_dir(&link_path).await;
            }
        }

        Ok(())
    }

    /// Create (or replace) the directory junction at `.current/<env>` so that
    /// it points to the install path of *record*.
    ///
    /// Uses `cmd.exe /c mklink /j` because the Rust standard library does not
    /// provide a stable junction-creation API. Directory junctions do not
    /// require `SeCreateSymbolicLinkPrivilege`, so this works without admin.
    async fn replace_current_link(
        &self,
        record: &InstallRecord,
        config: &AppConfig,
    ) -> AppResult<()> {
        let link_path = get_current_link_path(config, &record.environment);
        let target_path = record.install_path.clone();

        // Ensure the parent directory (`.current`) exists.
        if let Some(parent) = std::path::Path::new(&link_path).parent() {
            tokio::fs::create_dir_all(parent).await?;
        }

        // Remove the existing junction if present.
        if path_exists(&link_path).await {
            let link_clone = link_path.clone();
            tokio::task::spawn_blocking(move || {
                // On Windows, removing a junction does not remove the target.
                std::fs::remove_dir(&link_clone).ok();
            })
            .await
            .map_err(|e| AppError::Message(format!("join error: {}", e)))?;
        }

        // Create the new junction using `mklink /j`.
        // `symlink_dir` creates a true symbolic link that requires admin or Developer Mode.
        // `mklink /j` creates a directory junction (reparse point) which works without
        // elevated privileges, making it suitable for all users.
        tokio::task::spawn_blocking(move || -> AppResult<()> {
            let output = std::process::Command::new("cmd")
                .args(["/c", "mklink", "/j", &link_path, &target_path])
                .creation_flags(0x08000000) // CREATE_NO_WINDOW
                .output()
                .map_err(|e| AppError::Message(format!("failed to run mklink: {}", e)))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                return Err(AppError::Message(format!(
                    "failed to create junction: {} {}",
                    stderr.trim(),
                    stdout.trim()
                )));
            }
            Ok(())
        })
        .await
        .map_err(|e| AppError::Message(format!("join error: {}", e)))??;

        Ok(())
    }

    /// Switch the environment variable storage scope (user ↔ system).
    ///
    /// 1. Collects all managed env var names and PATH entries from all installations.
    /// 2. Removes those values from the old scope.
    /// 3. Re-applies the active installations' env vars to the new scope.
    pub async fn switch_env_scope(&self, new_scope: &str) -> AppResult<()> {
        let config = self.config_service.lock().await.get().await?;
        let old_scope = config.environment_management.env_scope.as_str();
        if old_scope == new_scope {
            return Ok(());
        }

        let data = self.read_data().await?;
        let defs = environment_definitions();

        // Collect all managed env var names.
        let mut all_env_var_names: Vec<String> = defs
            .iter()
            .flat_map(|d| d.env_vars.clone())
            .collect();
        all_env_var_names.sort();
        all_env_var_names.dedup();

        // Collect all PATH entries from all installations.
        let all_path_entries: Vec<String> = data
            .installations
            .iter()
            .flat_map(|r| r.path_entries.clone())
            .collect();

        // Step 1: Clean up old scope.
        registry::cleanup_scope(
            &self.app_handle,
            old_scope,
            &all_env_var_names,
            &all_path_entries,
        )
        .await?;

        // Step 2: Re-apply active installations to new scope.
        for d in &defs {
            let kind = &d.id;
            let records_for_kind: Vec<_> = data
                .installations
                .iter()
                .filter(|r| &r.environment == kind)
                .cloned()
                .collect();

            if let Some(active_record) = records_for_kind.iter().find(|r| r.active) {
                let plan =
                    self.create_apply_plan(active_record, &records_for_kind, &config);
                registry::apply_registry_plan(&self.app_handle, new_scope, &plan)
                    .await?;
            }
        }

        Ok(())
    }
}
