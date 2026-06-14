//! Tauri application setup and command registration.

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{Emitter, Manager};

mod error;
mod state;
mod shared;
mod environment_records;
mod services;
mod commands;

use state::AppState;
use services::config::ConfigService;
use services::system_status::SystemStatusService;
use services::environment_record::EnvironmentRecordService;
use services::environment_discovery::EnvironmentDiscoveryService;
use services::version_catalog::service::VersionCatalogService;
use services::task_service::TaskService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize core services
            let config_service = ConfigService::new(app_handle.clone())?;
            let system_status_service = SystemStatusService::new();

            let config_arc = Arc::new(Mutex::new(config_service));

            // Initialize environment services (depend on config)
            let environment_record_service = EnvironmentRecordService::new(
                app_handle.clone(),
                config_arc.clone(),
            )?;

            let env_record_arc = Arc::new(Mutex::new(environment_record_service));

            let environment_discovery_service = EnvironmentDiscoveryService::new(
                env_record_arc.clone(),
                config_arc.clone(),
            );

            let version_catalog_service = VersionCatalogService::new(config_arc.clone());

            // Initialize task service (depends on config + env_record)
            let task_service = TaskService::new(
                app_handle.clone(),
                config_arc.clone(),
                env_record_arc.clone(),
            )?;

            let task_arc = Arc::new(Mutex::new(task_service));

            // Create app state
            let state = AppState {
                app_handle: app_handle.clone(),
                config: config_arc.clone(),
                system_status: Arc::new(Mutex::new(system_status_service)),
                environment_record: env_record_arc.clone(),
                environment_discovery: Arc::new(Mutex::new(environment_discovery_service)),
                version_catalog: Arc::new(Mutex::new(version_catalog_service)),
                task: task_arc,
            };

            app.manage(state);

            // ── Pending scope migration ─────────────────────────────────
            // If the previous (non-elevated) instance saved a pending scope
            // change, apply it now that we are running as administrator.
            {
                let env_rec = env_record_arc.clone();
                let cfg = config_arc.clone();
                let handle = app_handle.clone();
                tauri::async_runtime::spawn(async move {
                    let config = cfg.lock().await.get().await;
                    if let Ok(config) = config {
                        if let Some(ref pending) = config.environment_management.pending_env_scope {
                            let target = pending.clone();
                            eprintln!("Applying pending scope migration: {} → {}", config.environment_management.env_scope, target);
                            let env = env_rec.lock().await;
                            match env.switch_env_scope(&target).await {
                                Ok(()) => {
                                    eprintln!("Pending scope migration succeeded.");
                                    // Persist the new scope and clear the pending field.
                                    let config_service = cfg.lock().await;
                                    let _ = config_service
                                        .update(serde_json::json!({
                                            "environmentManagement": {
                                                "envScope": target,
                                                "pendingEnvScope": null
                                            }
                                        }))
                                        .await;
                                    let _ = handle.emit("scope-migration-complete", ());
                                }
                                Err(e) => {
                                    eprintln!("Pending scope migration failed: {}", e);
                                    // Clear the pending field so we don't retry forever.
                                    let config_service = cfg.lock().await;
                                    let _ = config_service
                                        .update(serde_json::json!({
                                            "environmentManagement": { "pendingEnvScope": null }
                                        }))
                                        .await;
                                    let _ = handle.emit("scope-migration-failed", e.to_string());
                                }
                            }
                        }
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::config_get,
            commands::config_update,
            commands::config_switch_env_scope,
            commands::config_relaunch_as_admin,
            commands::system_get_status,
            commands::dialog_select_directory,
            commands::environments_get_summary,
            commands::environments_discover,
            commands::environments_adopt,
            commands::environments_set_active,
            commands::environments_uninstall,
            commands::catalog_list_versions,
            commands::tasks_list,
            commands::tasks_create_install,
            commands::tasks_cancel,
            commands::tasks_retry,
            commands::tasks_remove,
            commands::tasks_clear_finished,
            commands::tasks_get_retry_input,
            commands::permissions_check,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
