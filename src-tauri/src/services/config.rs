use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;
use crate::error::AppResult;
use super::json_file_store::JsonFileStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub global_install_dir: String,
    pub download_cache_dir: String,
    pub retain_downloads: bool,
    pub appearance: AppearanceConfig,
    pub environment_management: EnvironmentManagementConfig,
    pub proxy: ProxyConfig,
    pub mirrors: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppearanceConfig {
    pub navigation_layout: String, // "sidebar" | "rail"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentManagementConfig {
    pub mode: String, // "symlink" | "direct"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub http_proxy: String,
    pub https_proxy: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let testing_global_install_dir = "E:\\dev_env".to_string();

        Self {
            global_install_dir: testing_global_install_dir.clone(),
            download_cache_dir: format!("{}\\.cache", testing_global_install_dir),
            retain_downloads: true,
            appearance: AppearanceConfig {
                navigation_layout: "sidebar".to_string(),
            },
            environment_management: EnvironmentManagementConfig {
                mode: "symlink".to_string(),
            },
            proxy: ProxyConfig {
                enabled: false,
                http_proxy: String::new(),
                https_proxy: String::new(),
            },
            mirrors: HashMap::new(), // Will be populated with official mirror settings
        }
    }
}

pub struct ConfigService {
    store: JsonFileStore<AppConfig>,
}

impl ConfigService {
    pub fn new(app_handle: AppHandle) -> AppResult<Self> {
        let config_path = app_handle
            .path()
            .resolve("config.json", BaseDirectory::AppData)
            .map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e))?;

        Ok(Self {
            store: JsonFileStore::new(config_path, AppConfig::default()),
        })
    }

    pub async fn get(&self) -> AppResult<AppConfig> {
        let config = self.store.read().await?;
        Ok(self.normalize_config(config))
    }

    pub async fn update(&self, patch: serde_json::Value) -> AppResult<AppConfig> {
        let new_config = self
            .store
            .update(|current| {
                let normalized = self.normalize_config(current);
                // Merge patch into config
                let mut merged = serde_json::to_value(normalized).unwrap();
                merge_json(&mut merged, &patch);
                serde_json::from_value(merged).unwrap_or_default()
            })
            .await?;

        Ok(self.normalize_config(new_config))
    }

    fn normalize_config(&self, mut config: AppConfig) -> AppConfig {
        let defaults = AppConfig::default();

        // Apply defaults for missing fields
        if config.global_install_dir.is_empty() {
            config.global_install_dir = defaults.global_install_dir;
        }
        if config.download_cache_dir.is_empty() {
            config.download_cache_dir = defaults.download_cache_dir;
        }

        config
    }
}

fn merge_json(base: &mut serde_json::Value, patch: &serde_json::Value) {
    if let (Some(base_obj), Some(patch_obj)) = (base.as_object_mut(), patch.as_object()) {
        for (key, value) in patch_obj {
            if let Some(base_value) = base_obj.get_mut(key) {
                if base_value.is_object() && value.is_object() {
                    merge_json(base_value, value);
                } else {
                    *base_value = value.clone();
                }
            } else {
                base_obj.insert(key.clone(), value.clone());
            }
        }
    }
}
