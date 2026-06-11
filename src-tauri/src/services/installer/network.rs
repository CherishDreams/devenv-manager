use std::path::Path;
use std::time::{Duration, Instant};
use futures_util::StreamExt;
use tokio::fs;
use tokio::io::AsyncWriteExt;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};
use crate::services::config::AppConfig;
use crate::shared::types::TaskDownloadProgress;

/// Download a file from `url` to `target_file`, reporting progress via callback.
pub async fn download_file(
    url: &str,
    target_file: &str,
    config: &AppConfig,
    cancel: &CancellationToken,
    on_progress: &(dyn Fn(TaskDownloadProgress) + Send + Sync),
) -> AppResult<()> {
    let client = crate::services::common::network::build_client(config)?;

    if let Some(parent) = Path::new(target_file).parent() {
        fs::create_dir_all(parent).await?;
    }

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| AppError::Message(format!("下载失败：{}\n{}", url, e)))?;

    if !response.status().is_success() {
        return Err(AppError::Message(format!(
            "下载失败 {}：{}",
            response.status().as_u16(),
            url
        )));
    }

    let total = response.content_length().unwrap_or(0);
    let file_name = Path::new(target_file)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let mut file = fs::File::create(target_file).await?;
    let mut stream = response.bytes_stream();
    let mut received: u64 = 0;
    let started_at = Instant::now();
    let mut last_speed_at = started_at;
    let mut last_speed_bytes: u64 = 0;
    let mut bytes_per_second: f64 = 0.0;
    let mut last_reported_at = started_at;

    let url_owned = url.to_string();
    let file_name_clone = file_name.clone();

    let emit_progress = |completed: bool,
                         received: u64,
                         bytes_per_second: f64,
                         total: u64,
                         url: &str,
                         file_name: &str| {
        let percent = if total > 0 {
            Some((received as f64 / total as f64 * 100.0).min(100.0).round())
        } else {
            None
        };
        on_progress(TaskDownloadProgress {
            url: url.to_string(),
            file_name: file_name.to_string(),
            received_bytes: received,
            total_bytes: if total > 0 { Some(total) } else { None },
            bytes_per_second,
            percent,
            updated_at: chrono::Utc::now().to_rfc3339(),
            completed,
        });
    };

    emit_progress(false, received, bytes_per_second, total, &url_owned, &file_name_clone);

    while let Some(chunk) = stream.next().await {
        if cancel.is_cancelled() {
            return Err(AppError::Message("任务已取消。".to_string()));
        }

        let chunk = chunk.map_err(|e| AppError::Message(format!("下载读取失败：{}", e)))?;
        file.write_all(&chunk).await?;
        received += chunk.len() as u64;

        let now = Instant::now();
        if now.duration_since(last_speed_at) >= Duration::from_millis(500) {
            let elapsed = now.duration_since(last_speed_at).as_secs_f64().max(0.001);
            bytes_per_second = ((received - last_speed_bytes) as f64 / elapsed).round();
            last_speed_at = now;
            last_speed_bytes = received;
        }

        if now.duration_since(last_reported_at) >= Duration::from_millis(500) {
            emit_progress(
                false,
                received,
                bytes_per_second,
                total,
                &url_owned,
                &file_name_clone,
            );
            last_reported_at = now;
        }
    }

    file.flush().await?;
    emit_progress(true, received, bytes_per_second, total, &url_owned, &file_name_clone);

    Ok(())
}
