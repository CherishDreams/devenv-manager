#![allow(dead_code)]

use std::sync::Arc;
use tokio::sync::Mutex;
use crate::error::{AppError, AppResult};
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
            EnvironmentKind::Cpp => providers::list_cpp_versions(&query.vendor, &config).await,
            EnvironmentKind::Lua => providers::list_lua_versions(&query.vendor, &config).await,
            EnvironmentKind::Rust => providers::list_rust_versions(&query.vendor, &config).await,
            EnvironmentKind::Gradle => providers::list_github_versions(
                &EnvironmentKind::Gradle, "gradle", "gradle/gradle", "Gradle",
                |name, _| name.contains("-all.zip"), &config,
            ).await,
            EnvironmentKind::Cmake => providers::list_github_versions(
                &EnvironmentKind::Cmake, "kitware", "Kitware/CMake", "CMake",
                |name, _| name.contains("windows-x86_64.zip"), &config,
            ).await,
            EnvironmentKind::Ninja => providers::list_github_versions(
                &EnvironmentKind::Ninja, "ninja-build", "ninja/ninja", "Ninja",
                |name, _| name.starts_with("ninja-win") && name.ends_with(".zip"), &config,
            ).await,
            // For environments without online providers, return error so frontend can use static data
            _ => Err(AppError::Message(format!(
                "环境 {} 暂无在线版本接口，请使用内置目录", query.environment
            ))),
        }
    }
}
