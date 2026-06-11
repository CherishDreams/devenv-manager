use std::collections::HashMap;
use std::path::Path;
use tokio::fs;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};
use crate::shared::types::*;
use super::file_system::{ensure_empty_install_target, path_exists};
use super::process::run_process;

/// Run a native installer (.exe) for environments that support silent install.
pub async fn run_installer(
    input: &InstallTaskInput,
    installer_path: &str,
    install_path: &str,
    cancel: &CancellationToken,
) -> AppResult<()> {
    match input.environment {
        EnvironmentKind::Python => {
            ensure_empty_install_target(install_path).await?;
            run_process(
                installer_path,
                &[
                    "/quiet",
                    "InstallAllUsers=0",
                    "AssociateFiles=0",
                    "Shortcuts=0",
                    "Include_launcher=0",
                    "Include_pip=1",
                    "Include_test=0",
                    "PrependPath=0",
                    &format!("TargetDir={}", install_path),
                ],
                cancel,
                None,
            )
            .await?;
            Ok(())
        }
        EnvironmentKind::Conda => {
            ensure_empty_install_target(install_path).await?;
            run_process(
                installer_path,
                &[
                    "/InstallationType=JustMe",
                    "/RegisterPython=0",
                    "/NoShortcuts=1",
                    "/AddToPath=0",
                    "/S",
                    &format!("/D={}", install_path),
                ],
                cancel,
                None,
            )
            .await?;
            Ok(())
        }
        EnvironmentKind::Rust => {
            let cargo_home = format!("{}\\cargo", install_path);
            let rustup_home = format!("{}\\rustup", install_path);
            ensure_empty_install_target(install_path).await?;
            fs::create_dir_all(&cargo_home).await?;
            fs::create_dir_all(&rustup_home).await?;

            let mut env = HashMap::new();
            env.insert("CARGO_HOME".to_string(), cargo_home);
            env.insert("RUSTUP_HOME".to_string(), rustup_home);

            run_process(
                installer_path,
                &[
                    "-y",
                    "--no-modify-path",
                    "--profile",
                    "default",
                    "--default-host",
                    "x86_64-pc-windows-msvc",
                    "--default-toolchain",
                    &input.version,
                ],
                cancel,
                Some(&env),
            )
            .await?;
            Ok(())
        }
        EnvironmentKind::Ruby => {
            ensure_empty_install_target(install_path).await?;
            run_process(
                installer_path,
                &[
                    "/verysilent",
                    "/suppressmsgboxes",
                    "/norestart",
                    &format!("/dir={}", install_path),
                    "/tasks=",
                ],
                cancel,
                None,
            )
            .await?;
            Ok(())
        }
        _ => Err(AppError::Message("暂不支持该安装器类型。".to_string())),
    }
}

/// Post-installation preparation for environments extracted from archives.
pub async fn prepare_installed_environment(
    input: &InstallTaskInput,
    install_path: &str,
    _cancel: &CancellationToken,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
) -> AppResult<()> {
    match input.environment {
        EnvironmentKind::Nvm => {
            let symlink_path = format!("{}\\nodejs", install_path);
            fs::create_dir_all(&symlink_path).await?;
            let settings = format!(
                "root: {}\r\npath: {}\r\narch: 64\r\nproxy: none\r\noriginalpath:\r\noriginalversion:\r\n",
                install_path, symlink_path
            );
            fs::write(format!("{}\\settings.txt", install_path), &settings).await?;
            on_log("已写入 nvm-windows settings.txt。", "info");
            Ok(())
        }
        EnvironmentKind::Lua => {
            let mut entries = fs::read_dir(install_path).await?;
            let mut lua_exe: Option<String> = None;
            let mut luac_exe: Option<String> = None;
            let lua_re = regex_lite::Regex::new(r"(?i)^lua\d+\.exe$").unwrap();
            let luac_re = regex_lite::Regex::new(r"(?i)^luac\d+\.exe$").unwrap();

            while let Some(entry) = entries.next_entry().await? {
                let name = entry.file_name().to_string_lossy().to_string();
                if lua_re.is_match(&name) {
                    lua_exe = Some(name.clone());
                }
                if luac_re.is_match(&name) {
                    luac_exe = Some(name);
                }
            }

            if let Some(ref name) = lua_exe {
                let src = format!("{}\\{}", install_path, name);
                let dst = format!("{}\\lua.exe", install_path);
                if !path_exists(&dst).await {
                    fs::copy(&src, &dst).await?;
                }
            }
            if let Some(ref name) = luac_exe {
                let src = format!("{}\\{}", install_path, name);
                let dst = format!("{}\\luac.exe", install_path);
                if !path_exists(&dst).await {
                    fs::copy(&src, &dst).await?;
                }
            }
            on_log("已生成 Lua 通用命令入口。", "info");
            Ok(())
        }
        EnvironmentKind::Php => {
            let dev_ini = format!("{}\\php.ini-development", install_path);
            let ini = format!("{}\\php.ini", install_path);
            if path_exists(&dev_ini).await && !path_exists(&ini).await {
                fs::copy(&dev_ini, &ini).await?;
                on_log("已生成 PHP php.ini。", "info");
            }
            Ok(())
        }
        EnvironmentKind::Android => {
            let nested = format!("{}\\cmdline-tools\\cmdline-tools", install_path);
            let latest = format!("{}\\cmdline-tools\\latest", install_path);

            if path_exists(&nested).await {
                // Move nested -> latest
                if path_exists(&latest).await {
                    fs::remove_dir_all(&latest).await?;
                }
                fs::rename(&nested, &latest).await?;

                // Move contents of latest up to cmdline-tools
                let latest_path = Path::new(&latest);
                for item in &["bin", "lib"] {
                    let src = latest_path.join(item);
                    let dst = Path::new(install_path).join("cmdline-tools").join(item);
                    if src.exists() {
                        if dst.exists() {
                            fs::remove_dir_all(&dst).await?;
                        }
                        fs::rename(&src, &dst).await?;
                    }
                }
                let src_props = latest_path.join("source.properties");
                let dst_props = Path::new(install_path)
                    .join("cmdline-tools")
                    .join("source.properties");
                if src_props.exists() {
                    if dst_props.exists() {
                        fs::remove_file(&dst_props).await?;
                    }
                    fs::rename(&src_props, &dst_props).await?;
                }

                fs::remove_dir_all(&latest).await?;
                on_log("已整理 Android Command Line Tools 目录。", "info");
            }
            Ok(())
        }
        _ => Ok(()),
    }
}
