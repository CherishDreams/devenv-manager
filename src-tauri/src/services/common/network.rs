#![allow(dead_code)]

use std::time::Duration;
use serde::de::DeserializeOwned;
use crate::error::{AppError, AppResult};
use crate::services::config::AppConfig;
pub use crate::shared::utils::{unique, compare_version_desc as compare_versions_desc};

const REQUEST_TIMEOUT_SECS: u64 = 20;
pub const MAX_VERSION_OPTIONS: usize = 40;

/// Build a reqwest::Client with optional proxy from config.
pub fn build_client(config: &AppConfig) -> AppResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .timeout(Duration::from_secs(REQUEST_TIMEOUT_SECS))
        .user_agent("env-manager/1.0");

    if config.proxy.enabled {
        let proxy_url = config.proxy.https_proxy.trim();
        if !proxy_url.is_empty() {
            builder = builder.proxy(
                reqwest::Proxy::all(proxy_url)
                    .map_err(|e| AppError::Message(format!("代理地址无效：{}\n{}", proxy_url, e)))?
            );
        }
    }

    builder.build().map_err(|e| AppError::Message(format!("构建 HTTP 客户端失败：{}", e)))
}

/// Fetch raw text from a URL.
pub async fn fetch_text(url: &str, config: &AppConfig) -> AppResult<String> {
    let client = build_client(config)?;
    let response = client.get(url).send().await
        .map_err(|e| AppError::Message(format!("请求失败 {}: {}", url, e)))?;

    if !response.status().is_success() {
        return Err(AppError::Message(format!("{} {}", response.status().as_u16(), response.status().canonical_reason().unwrap_or(""))));
    }

    response.text().await.map_err(|e| AppError::Message(format!("读取响应失败 {}: {}", url, e)))
}

/// Fetch and deserialize JSON from a URL.
pub async fn fetch_json<T: DeserializeOwned>(url: &str, config: &AppConfig) -> AppResult<T> {
    let client = build_client(config)?;
    let response = client.get(url).send().await
        .map_err(|e| AppError::Message(format!("请求失败 {}: {}", url, e)))?;

    if !response.status().is_success() {
        return Err(AppError::Message(format!("{} {}", response.status().as_u16(), response.status().canonical_reason().unwrap_or(""))));
    }

    response.json::<T>().await.map_err(|e| AppError::Message(format!("解析 JSON 失败 {}: {}", url, e)))
}

/// Fetch JSON from multiple sources, trying each in order.
pub struct FetchSource {
    pub name: String,
    pub url: String,
}

pub async fn fetch_json_from_sources<T: DeserializeOwned>(
    sources: &[FetchSource],
    config: &AppConfig,
) -> AppResult<(T, String)> {
    let mut errors = Vec::new();

    for source in sources {
        match fetch_json::<T>(&source.url, config).await {
            Ok(data) => return Ok((data, source.name.clone())),
            Err(e) => errors.push(format!("{}: {}", source.name, e)),
        }
    }

    Err(AppError::Message(format!("所有版本源请求失败：{}", errors.join("；"))))
}
