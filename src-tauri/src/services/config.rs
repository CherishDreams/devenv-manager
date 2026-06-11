use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri::path::BaseDirectory;
use crate::error::AppResult;
use super::json_file_store::JsonFileStore;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct AppearanceConfig {
    pub navigation_layout: String, // "sidebar" | "rail"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnvironmentManagementConfig {
    pub mode: String, // "symlink" | "direct"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProxyConfig {
    pub enabled: bool,
    pub http_proxy: String,
    pub https_proxy: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        let global_install_dir = dirs::home_dir()
            .map(|p| p.join("dev_env").to_string_lossy().to_string())
            .unwrap_or_else(|| "C:\\dev_env".to_string());

        Self {
            global_install_dir: global_install_dir.clone(),
            download_cache_dir: format!("{}\\.cache", global_install_dir),
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
        let raw = self.store.read_raw_json().await?;
        let normalized = normalize_keys_to_camel_case(&raw);
        let defaults = serde_json::to_value(AppConfig::default())?;
        let filled = fill_missing_fields(&normalized, &defaults);
        let config: AppConfig = serde_json::from_value(filled)?;
        Ok(self.normalize_config(config))
    }

    pub async fn update(&self, patch: serde_json::Value) -> AppResult<AppConfig> {
        let raw = self.store.read_raw_json().await?;
        let normalized = normalize_keys_to_camel_case(&raw);
        let defaults = serde_json::to_value(AppConfig::default())?;
        let filled = fill_missing_fields(&normalized, &defaults);
        let mut merged = filled;
        merge_json(&mut merged, &patch);

        let config: AppConfig = serde_json::from_value(merged.clone()).unwrap_or_else(|_| {
            let d = serde_json::to_value(AppConfig::default()).unwrap();
            serde_json::from_value(d).unwrap()
        });
        let result = self.normalize_config(config);

        self.store.write(&result).await?;
        Ok(result)
    }

    fn normalize_config(&self, mut config: AppConfig) -> AppConfig {
        let defaults = AppConfig::default();

        if config.global_install_dir.is_empty() {
            config.global_install_dir = defaults.global_install_dir;
        }
        if config.download_cache_dir.is_empty() {
            config.download_cache_dir = defaults.download_cache_dir;
        }
        if config.appearance.navigation_layout.is_empty() {
            config.appearance.navigation_layout = defaults.appearance.navigation_layout;
        }
        if config.environment_management.mode.is_empty() {
            config.environment_management.mode = defaults.environment_management.mode;
        }

        config
    }
}

/// Converts snake_case keys to camelCase in a JSON value.
/// This handles migration from older config files that used snake_case keys.
fn normalize_keys_to_camel_case(value: &serde_json::Value) -> serde_json::Value {
    match value {
        serde_json::Value::Object(map) => {
            let mut new_map = serde_json::Map::new();
            for (key, val) in map {
                let camel_key = snake_to_camel(key);
                new_map.insert(camel_key, normalize_keys_to_camel_case(val));
            }
            serde_json::Value::Object(new_map)
        }
        serde_json::Value::Array(arr) => {
            serde_json::Value::Array(arr.iter().map(normalize_keys_to_camel_case).collect())
        }
        other => other.clone(),
    }
}

/// Converts a snake_case string to camelCase.
fn snake_to_camel(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    let mut capitalize_next = false;
    for (i, ch) in s.chars().enumerate() {
        if ch == '_' {
            capitalize_next = true;
        } else if capitalize_next {
            result.extend(ch.to_uppercase());
            capitalize_next = false;
        } else {
            if i == 0 {
                result.extend(ch.to_lowercase());
            } else {
                result.push(ch);
            }
        }
    }
    result
}

/// Recursively fills missing fields in `value` from `defaults`.
/// Also treats empty strings as "missing" and replaces them with defaults.
fn fill_missing_fields(value: &serde_json::Value, defaults: &serde_json::Value) -> serde_json::Value {
    match (value.as_object(), defaults.as_object()) {
        (Some(_), Some(def_obj)) => {
            let mut result = value.clone();
            let result_obj = result.as_object_mut().unwrap();
            for (key, def_val) in def_obj {
                if let Some(val) = result_obj.get(key) {
                    if val.is_object() && def_val.is_object() {
                        // Recurse into nested objects
                        result_obj.insert(key.clone(), fill_missing_fields(val, def_val));
                    } else if val.is_string() && val.as_str().map_or(true, str::is_empty) && def_val.is_string() {
                        // Replace empty strings with default values
                        result_obj.insert(key.clone(), def_val.clone());
                    }
                    // For non-empty values, keep the existing value
                } else {
                    // Key is missing entirely, use default
                    result_obj.insert(key.clone(), def_val.clone());
                }
            }
            result
        }
        _ => value.clone(),
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
