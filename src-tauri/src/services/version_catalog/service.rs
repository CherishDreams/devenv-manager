#![allow(dead_code)]

use std::sync::Arc;
use tokio::sync::Mutex;
use crate::error::AppResult;
use crate::shared::types::*;
use crate::services::config::ConfigService;
use super::providers;

pub struct VersionCatalogService {
    config_service: Arc<Mutex<ConfigService>>,
}

impl VersionCatalogService {
    pub fn new(config_service: Arc<Mutex<ConfigService>>) -> Self {
        Self { config_service }
    }

    pub async fn list_versions(&self, query: &VersionCatalogQuery) -> AppResult<Vec<AvailableVersion>> {
        let config = self.config_service.lock().await.get().await?;

        match &query.environment {
            EnvironmentKind::Java => providers::list_java_versions(&query.vendor, &config).await,
            EnvironmentKind::Node => providers::list_node_versions(&config).await,
            EnvironmentKind::Go => providers::list_go_versions(&config).await,
            EnvironmentKind::Python => providers::list_python_versions(&config).await,
            EnvironmentKind::Conda => providers::list_conda_versions(&query.vendor, &config).await,
            EnvironmentKind::Maven => providers::list_maven_versions(&config).await,
            // For other environments, return empty for now (will use static data)
            _ => Ok(vec![]),
        }
    }
}
