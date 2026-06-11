use std::path::{Path, PathBuf};
use tokio::fs;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};
use crate::services::common::shell::ps_quote;

pub async fn path_exists(path: &str) -> bool {
    tokio::fs::metadata(path).await.is_ok()
}

/// Ensure the install target directory exists and is empty.
/// If it exists with content, throws an error.
/// If it doesn't exist, creates the parent directory.
pub async fn ensure_empty_install_target(install_path: &str) -> AppResult<()> {
    let path = Path::new(install_path);

    if !path.exists() {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).await?;
        }
        return Ok(());
    }

    let mut entries = fs::read_dir(install_path).await?;
    if entries.next_entry().await?.is_some() {
        return Err(AppError::Message(format!(
            "安装目录已存在且不为空：{}",
            install_path
        )));
    }

    fs::remove_dir_all(install_path).await?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await?;
    }
    Ok(())
}

async fn move_directory(source: &str, target: &str) -> AppResult<()> {
    match fs::rename(source, target).await {
        Ok(()) => Ok(()),
        Err(e) if e.kind() == std::io::ErrorKind::CrossesDevices => {
            copy_dir_recursive(source, target).await?;
            fs::remove_dir_all(source).await?;
            Ok(())
        }
        Err(e) => Err(e.into()),
    }
}

fn copy_dir_recursive<'a>(
    src: &'a str,
    dst: &'a str,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = AppResult<()>> + Send + 'a>> {
    Box::pin(async move {
        fs::create_dir_all(dst).await?;
        let mut entries = fs::read_dir(src).await?;
        while let Some(entry) = entries.next_entry().await? {
            let src_path = entry.path();
            let dst_path = Path::new(dst).join(entry.file_name());
            if src_path.is_dir() {
                copy_dir_recursive(
                    src_path.to_str().unwrap_or_default(),
                    dst_path.to_str().unwrap_or_default(),
                )
                .await?;
            } else {
                fs::copy(&src_path, &dst_path).await?;
            }
        }
        Ok(())
    })
}

async fn find_archive_root(extract_dir: &str) -> AppResult<PathBuf> {
    let mut entries = fs::read_dir(extract_dir).await?;
    let mut directories = Vec::new();

    while let Some(entry) = entries.next_entry().await? {
        if entry.file_type().await?.is_dir() {
            directories.push(entry.file_name());
        }
    }

    if directories.len() == 1 {
        Ok(Path::new(extract_dir).join(&directories[0]))
    } else {
        Ok(PathBuf::from(extract_dir))
    }
}

/// Extract an archive to the install path using tar.exe with PowerShell fallback.
pub async fn extract_zip(
    archive_path: &str,
    install_path: &str,
    cache_dir: &str,
    cancel: &CancellationToken,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
) -> AppResult<()> {
    let extract_id = uuid::Uuid::new_v4();
    let extract_dir = format!("{}\\extract-{}-{}", cache_dir, chrono::Utc::now().timestamp_millis(), extract_id);
    fs::create_dir_all(&extract_dir).await?;

    let mut extractor_name = "tar.exe";

    // Try tar.exe first
    on_log("正在使用 tar.exe 解压安装包。", "info");
    let tar_result = crate::services::installer::process::run_process(
        "tar.exe",
        &["-xf", archive_path, "-C", &extract_dir],
        cancel,
        None,
    )
    .await;

    if let Err(e) = tar_result {
        if cancel.is_cancelled() {
            let _ = fs::remove_dir_all(&extract_dir).await;
            return Err(e);
        }
        extractor_name = "PowerShell Expand-Archive";
        let msg = e.to_string();
        let first_line = msg.lines().next().unwrap_or(&msg);
        on_log(&format!("tar.exe 解压失败，回退 PowerShell：{}", first_line), "warn");

        let ps_cmd = format!(
            "Expand-Archive -LiteralPath {} -DestinationPath {} -Force",
            ps_quote(archive_path),
            ps_quote(&extract_dir)
        );
        crate::services::installer::process::run_process(
            "powershell.exe",
            &["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_cmd],
            cancel,
            None,
        )
        .await?;
    }

    on_log(&format!("解压完成：{}。", extractor_name), "info");

    let archive_root = find_archive_root(&extract_dir).await?;
    ensure_empty_install_target(install_path).await?;
    move_directory(
        archive_root.to_str().unwrap_or_default(),
        install_path,
    )
    .await?;

    let _ = fs::remove_dir_all(&extract_dir).await;
    Ok(())
}
