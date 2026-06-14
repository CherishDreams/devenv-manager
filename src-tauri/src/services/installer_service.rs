use tokio::fs;
use tokio_util::sync::CancellationToken;
use crate::error::AppResult;
use crate::services::config::AppConfig;
use crate::services::installer::database_setup::apply_database_install_config;
use crate::services::installer::environment_metadata::{
    get_install_path, get_verification_command,
};
use crate::environment_records::helpers::{get_definition, get_env_vars, get_path_entries};
use crate::services::installer::file_system::{ensure_empty_install_target, extract_zip};
use crate::services::installer::install_executor::{
    prepare_installed_environment, run_installer,
};
use crate::services::installer::network::download_file;
use crate::services::installer::process::run_process;
use crate::services::installer::resources::resolve_resource;
use crate::shared::types::*;

/// Result of a successful installation.
#[derive(Debug, Clone)]
pub struct InstallationResult {
    pub install_path: String,
    pub resolved_version: String,
    pub env_vars: std::collections::HashMap<String, String>,
    pub path_entries: Vec<String>,
    pub verification_output: String,
}

/// Callbacks for installer events.
pub struct InstallerCallbacks {
    pub on_log: Box<dyn Fn(&str, &str) + Send + Sync>,
    pub on_progress: Box<dyn Fn(f64) + Send + Sync>,
    pub on_download_progress: Box<dyn Fn(TaskDownloadProgress) + Send + Sync>,
}

/// Run the full installation pipeline. This is a free function so it doesn't
/// need to borrow the TaskService (which would cause deadlocks).
pub async fn run_installation(
    input: &InstallTaskInput,
    config: &AppConfig,
    cb: &InstallerCallbacks,
    cancel: &CancellationToken,
) -> AppResult<InstallationResult> {
    let definition = get_definition(&input.environment)?;
    (cb.on_log)("正在读取安装配置。", "info");

    if config.proxy.enabled
        && (!config.proxy.http_proxy.trim().is_empty()
            || !config.proxy.https_proxy.trim().is_empty())
    {
        (cb.on_log)("已启用代理配置。", "info");
    } else if config.proxy.enabled {
        (cb.on_log)("代理已启用但未填写地址，将使用直连。", "warn");
    }

    fs::create_dir_all(&config.global_install_dir).await?;
    fs::create_dir_all(&config.download_cache_dir).await?;
    (cb.on_progress)(5.0);
    (cb.on_log)(&format!("已确认安装目录：{}", config.global_install_dir), "info");
    (cb.on_log)(&format!("已确认下载缓存目录：{}", config.download_cache_dir), "info");

    let resource = resolve_resource(input, config, cancel).await?;
    (cb.on_progress)(12.0);
    let source_info = resource.source_name.as_ref().map(|s| format!("（{}）", s)).unwrap_or_default();
    (cb.on_log)(&format!("资源已解析：{}{}", resource.file_name, source_info), "info");

    let install_path = get_install_path(config, input, &resource.resolved_version);
    ensure_empty_install_target(&install_path).await?;
    (cb.on_progress)(16.0);
    (cb.on_log)(&format!("目标安装目录可用：{}", install_path), "info");

    let download_path = format!("{}\\{}", config.download_cache_dir, resource.file_name);
    (cb.on_log)(&format!("开始下载：{}", resource.url), "info");

    download_file(
        &resource.url,
        &download_path,
        config,
        cancel,
        &|progress| {
            (cb.on_download_progress)(progress.clone());
            if let Some(percent) = progress.percent {
                (cb.on_progress)((18.0 + percent / 100.0 * 37.0).min(55.0));
            }
        },
    )
    .await?;
    (cb.on_progress)(58.0);
    (cb.on_log)(&format!("下载完成：{}", download_path), "info");

    if resource.package_type == InstallType::Archive {
        (cb.on_log)("开始解压安装包。", "info");
        (cb.on_log)("优先使用 Windows tar.exe 解压，失败时自动回退 PowerShell。", "info");
        (cb.on_progress)(62.0);
        extract_zip(
            &download_path,
            &install_path,
            &config.download_cache_dir,
            cancel,
            &|msg, level| (cb.on_log)(msg, level),
        )
        .await?;
    } else {
        (cb.on_log)("开始执行静默安装。", "info");
        (cb.on_progress)(62.0);
        run_installer(input, &download_path, &install_path, cancel).await?;
    }

    prepare_installed_environment(input, &install_path, cancel, &|msg, level| {
        (cb.on_log)(msg, level);
    })
    .await?;

    apply_database_install_config(input, &install_path, &|msg, level| {
        (cb.on_log)(msg, level);
    }, cancel)
    .await?;

    (cb.on_progress)(78.0);
    (cb.on_log)("安装文件已就绪。", "info");

    let env_vars = get_env_vars(&definition, &install_path);
    let path_entries = get_path_entries(&definition, &install_path);

    if input.configure_system_env {
        (cb.on_log)("安装完成后将按设置应用环境变量。", "info");
    } else {
        (cb.on_log)("已跳过环境变量配置。", "warn");
    }

    (cb.on_progress)(88.0);

    let (verify_cmd, verify_args) = get_verification_command(&input.environment, &install_path);
    let verify_args_refs: Vec<&str> = verify_args.iter().map(|s| s.as_str()).collect();
    let (stdout, stderr) = run_process(&verify_cmd, &verify_args_refs, cancel, Some(&env_vars)).await?;
    let verification_output = [stdout.trim(), stderr.trim()]
        .iter()
        .filter(|s| !s.is_empty())
        .copied()
        .collect::<Vec<_>>()
        .join("\n");

    (cb.on_progress)(96.0);
    let first_line = verification_output.lines().next().unwrap_or(&verify_cmd);
    (cb.on_log)(&format!("验证完成：{}", first_line), "info");

    if !config.retain_downloads {
        let _ = fs::remove_file(&download_path).await;
        (cb.on_log)("已清理下载缓存。", "info");
    }

    Ok(InstallationResult {
        install_path,
        resolved_version: resource.resolved_version,
        env_vars,
        path_entries,
        verification_output,
    })
}
