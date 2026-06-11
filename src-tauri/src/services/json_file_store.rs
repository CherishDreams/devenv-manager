use std::path::PathBuf;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use serde::{de::DeserializeOwned, Serialize};
use crate::error::AppResult;

pub struct JsonFileStore<T> {
    path: PathBuf,
    default: T,
    lock: tokio::sync::Mutex<()>,
}

impl<T> JsonFileStore<T>
where
    T: Clone + Serialize + DeserializeOwned + Send + Sync + 'static,
{
    pub fn new(path: PathBuf, default: T) -> Self {
        Self {
            path,
            default,
            lock: tokio::sync::Mutex::new(()),
        }
    }

    pub async fn read(&self) -> AppResult<T> {
        let _guard = self.lock.lock().await;

        match fs::read_to_string(&self.path).await {
            Ok(content) => {
                match serde_json::from_str::<T>(&content) {
                    Ok(data) => Ok(data),
                    Err(_) => {
                        // Corrupted file, return default and rewrite
                        let default = self.default.clone();
                        self.write_internal(&default).await?;
                        Ok(default)
                    }
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                // File doesn't exist, create with default
                let default = self.default.clone();
                self.write_internal(&default).await?;
                Ok(default)
            }
            Err(e) => Err(e.into()),
        }
    }

    pub async fn write(&self, data: &T) -> AppResult<()> {
        let _guard = self.lock.lock().await;
        self.write_internal(data).await
    }

    async fn write_internal(&self, data: &T) -> AppResult<()> {
        // Ensure parent directory exists
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).await?;
        }

        // Write to temp file first (atomic write)
        let temp_path = self.path.with_extension("tmp");
        let json = serde_json::to_string_pretty(data)?;

        let mut file = fs::File::create(&temp_path).await?;
        file.write_all(json.as_bytes()).await?;
        file.sync_all().await?;
        drop(file);

        // Rename temp to target (atomic on most filesystems)
        fs::rename(&temp_path, &self.path).await?;

        Ok(())
    }

    /// Reads the file as raw JSON, or returns the default value serialized if the file is missing or invalid.
    pub async fn read_raw_json(&self) -> AppResult<serde_json::Value> {
        let _guard = self.lock.lock().await;

        match fs::read_to_string(&self.path).await {
            Ok(content) => {
                match serde_json::from_str::<serde_json::Value>(&content) {
                    Ok(value) if value.is_object() => Ok(value),
                    _ => Ok(serde_json::to_value(&self.default)?),
                }
            }
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => {
                Ok(serde_json::to_value(&self.default)?)
            }
            Err(e) => Err(e.into()),
        }
    }

    pub async fn update<F>(&self, updater: F) -> AppResult<T>
    where
        F: FnOnce(T) -> T,
    {
        let _guard = self.lock.lock().await;

        let current = match fs::read_to_string(&self.path).await {
            Ok(content) => serde_json::from_str::<T>(&content).unwrap_or_else(|_| self.default.clone()),
            Err(_) => self.default.clone(),
        };

        let new_data = updater(current);
        self.write_internal(&new_data).await?;
        Ok(new_data)
    }
}
