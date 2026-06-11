use serde::Deserialize;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};
use crate::services::config::AppConfig;
use crate::shared::types::*;

// ── PackageResource ──────────────────────────────────────────────────────────

#[derive(Debug, Clone)]
pub struct PackageResource {
    pub url: String,
    pub file_name: String,
    pub package_type: InstallType,
    pub resolved_version: String,
    pub source_name: Option<String>,
}

// ── Mirror helpers ───────────────────────────────────────────────────────────

fn get_mirror<'a>(config: &'a AppConfig, key: &str) -> &'a str {
    config.mirrors.get(key).map(|s| s.as_str()).unwrap_or("")
}

fn resolve_base_url(configured: &str, official: &str) -> String {
    let trimmed = configured.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        trimmed.trim_end_matches('/').to_string()
    } else {
        official.to_string()
    }
}

fn mirror_source_name(key: &str, configured: &str, official_name: &str) -> String {
    let trimmed = configured.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        format!("{} 镜像", key)
    } else {
        official_name.to_string()
    }
}

// ── Android ──────────────────────────────────────────────────────────────────

fn resolve_android(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("google");
    if vendor != "google" {
        return Err(AppError::Message("当前自动安装暂只支持 Android Command Line Tools。".into()));
    }
    let file_name = format!("commandlinetools-win-{}_latest.zip", input.version);
    let mirror = get_mirror(config, "android");
    let base = resolve_base_url(mirror, "https://dl.google.com/android/repository");
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("android", mirror, "Android 官方源")),
    })
}

// ── CMake ────────────────────────────────────────────────────────────────────

fn resolve_cmake(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("kitware");
    if vendor != "kitware" {
        return Err(AppError::Message("当前自动安装暂只支持 Kitware CMake。".into()));
    }
    let file_name = format!("cmake-{}-windows-x86_64.zip", input.version);
    let mirror = get_mirror(config, "cmake");
    let trimmed = mirror.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        Ok(PackageResource {
            url: format!("{}/{}", base, file_name),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some(mirror_source_name("cmake", mirror, "CMake GitHub Releases")),
        })
    } else {
        Ok(PackageResource {
            url: format!(
                "https://github.com/Kitware/CMake/releases/download/v{}/{}",
                input.version, file_name
            ),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some("CMake GitHub Releases".into()),
        })
    }
}

// ── Conda ────────────────────────────────────────────────────────────────────

fn resolve_conda(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("miniconda");
    let mirror = get_mirror(config, "conda");
    let base = resolve_base_url(mirror, "https://repo.anaconda.com");
    let source_name = mirror_source_name("conda", mirror, "Anaconda 官方源");

    if vendor == "anaconda" {
        let file_name = if input.version == "latest" {
            "Anaconda3-latest-Windows-x86_64.exe".to_string()
        } else {
            format!("Anaconda3-{}-Windows-x86_64.exe", input.version)
        };
        return Ok(PackageResource {
            url: format!("{}/archive/{}", base, file_name),
            file_name,
            package_type: InstallType::Installer,
            resolved_version: input.version.clone(),
            source_name: Some(source_name),
        });
    }

    let file_name = if input.version == "latest" || input.version.starts_with("py") {
        "Miniconda3-latest-Windows-x86_64.exe".to_string()
    } else {
        format!("Miniconda3-{}-Windows-x86_64.exe", input.version)
    };
    Ok(PackageResource {
        url: format!("{}/miniconda/{}", base, file_name),
        file_name,
        package_type: InstallType::Installer,
        resolved_version: input.version.clone(),
        source_name: Some(source_name),
    })
}

// ── Cpp (LLVM-MinGW) ────────────────────────────────────────────────────────

fn resolve_cpp(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("llvm-mingw");
    if vendor != "llvm-mingw" {
        return Err(AppError::Message("当前自动安装暂只支持 LLVM-MinGW。".into()));
    }
    let file_name = format!("llvm-mingw-{}-ucrt-x86_64.zip", input.version);
    let mirror = get_mirror(config, "cpp");
    let trimmed = mirror.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        Ok(PackageResource {
            url: format!("{}/{}", base, file_name),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some(mirror_source_name("cpp", mirror, "LLVM-MinGW GitHub Releases")),
        })
    } else {
        Ok(PackageResource {
            url: format!(
                "https://github.com/mstorsjo/llvm-mingw/releases/download/{}/{}",
                input.version, file_name
            ),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some("LLVM-MinGW GitHub Releases".into()),
        })
    }
}

// ── Dotnet ───────────────────────────────────────────────────────────────────

fn resolve_dotnet(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("microsoft");
    if vendor != "microsoft" {
        return Err(AppError::Message("当前自动安装暂只支持 Microsoft .NET SDK。".into()));
    }
    let file_name = format!("dotnet-sdk-{}-win-x64.zip", input.version);
    let mirror = get_mirror(config, "dotnet");
    let base = resolve_base_url(mirror, "https://dotnetcli.azureedge.net/dotnet");
    Ok(PackageResource {
        url: format!("{}/Sdk/{}/{}", base, input.version, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("dotnet", mirror, ".NET 官方源")),
    })
}

// ── Flutter ──────────────────────────────────────────────────────────────────

fn resolve_flutter(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("google");
    if vendor != "google" {
        return Err(AppError::Message("当前自动安装暂只支持 Flutter 官方 SDK。".into()));
    }
    let file_name = format!("flutter_windows_{}-stable.zip", input.version);
    let mirror = get_mirror(config, "flutter");
    let base = resolve_base_url(
        mirror,
        "https://storage.googleapis.com/flutter_infra_release/releases/stable/windows",
    );
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("flutter", mirror, "Flutter 官方源")),
    })
}

// ── Go (async — fetches release metadata) ────────────────────────────────────

#[derive(Deserialize)]
struct GoRelease {
    version: String,
    files: Vec<GoFile>,
}

#[derive(Deserialize)]
struct GoFile {
    filename: String,
    os: String,
    arch: String,
    kind: String,
}

async fn resolve_go(
    input: &InstallTaskInput,
    config: &AppConfig,
    _cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    let mirror = get_mirror(config, "go");
    let trimmed = mirror.trim();

    let mut sources: Vec<(String, String)> = Vec::new();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        let dl = if base.ends_with("/dl") {
            base.to_string()
        } else {
            format!("{}/dl", base)
        };
        sources.push((mirror_source_name("go", mirror, "Go 官方源"), dl));
    }
    sources.push(("Go 官方源".to_string(), "https://go.dev/dl".to_string()));
    sources.push(("Go 中国镜像".to_string(), "https://golang.google.cn/dl".to_string()));

    let client = crate::services::common::network::build_client(config)?;
    let mut last_err = String::new();

    for (name, dl_base) in &sources {
        let url = format!("{}/?mode=json&include=all", dl_base);
        match client.get(&url).send().await {
            Ok(resp) if resp.status().is_success() => {
                match resp.json::<Vec<GoRelease>>().await {
                    Ok(releases) => {
                        let prefix = format!("go{}", input.version);
                        if let Some(release) = releases.iter().find(|r| {
                            r.version == prefix || r.version.starts_with(&format!("{}.", prefix))
                        }) {
                            if let Some(file) = release.files.iter().find(|f| {
                                f.os == "windows" && f.arch == "amd64" && f.kind == "archive"
                            }) {
                                return Ok(PackageResource {
                                    url: format!("{}/{}", dl_base, file.filename),
                                    file_name: file.filename.clone(),
                                    package_type: InstallType::Archive,
                                    resolved_version: release
                                        .version
                                        .strip_prefix("go")
                                        .unwrap_or(&release.version)
                                        .to_string(),
                                    source_name: Some(name.clone()),
                                });
                            }
                        }
                        last_err = format!("{}: 未找到匹配的 Windows x64 压缩包", name);
                    }
                    Err(e) => last_err = format!("{}: 解析 JSON 失败 {}", name, e),
                }
            }
            Ok(resp) => last_err = format!("{}: HTTP {}", name, resp.status()),
            Err(e) => last_err = format!("{}: {}", name, e),
        }
    }

    Err(AppError::Message(format!(
        "未找到 Go {} 的 Windows x64 压缩包。{}",
        input.version, last_err
    )))
}

// ── Gradle ───────────────────────────────────────────────────────────────────

fn resolve_gradle(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("gradle");
    if vendor != "gradle" {
        return Err(AppError::Message("当前自动安装暂只支持 Gradle 官方发行版。".into()));
    }
    let file_name = format!("gradle-{}-bin.zip", input.version);
    let mirror = get_mirror(config, "gradle");
    let trimmed = mirror.trim();
    let base = if !trimmed.is_empty() && trimmed != "official" {
        trimmed.trim_end_matches('/').to_string()
    } else {
        "https://services.gradle.org/distributions".to_string()
    };
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("gradle", mirror, "Gradle 官方源")),
    })
}

// ── Java (async — vendor-specific APIs) ──────────────────────────────────────

#[derive(Deserialize)]
struct ZuluPackage {
    download_url: String,
    java_version: Vec<i32>,
    name: String,
}

#[derive(Deserialize)]
struct LibericaRelease {
    #[serde(rename = "downloadUrl")]
    download_url: String,
    filename: String,
    #[serde(rename = "GA")]
    ga: bool,
    #[serde(rename = "packageType")]
    package_type: String,
    version: String,
}

async fn resolve_java(
    input: &InstallTaskInput,
    config: &AppConfig,
    _cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("temurin");

    if vendor == "temurin" {
        return Ok(PackageResource {
            url: format!(
                "https://api.adoptium.net/v3/binary/latest/{}/ga/windows/x64/jdk/hotspot/normal/eclipse?project=jdk",
                input.version
            ),
            file_name: format!("temurin-jdk-{}-windows-x64.zip", input.version),
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some("Adoptium API".into()),
        });
    }

    if vendor == "zulu" {
        let url = format!(
            "https://api.azul.com/metadata/v1/zulu/packages/?java_version={}&os=windows&arch=x64&java_package_type=jdk&archive_type=zip&release_status=ga&availability_types=CA&page=1&page_size=50",
            input.version
        );
        let packages: Vec<ZuluPackage> =
            crate::services::common::network::fetch_json(&url, config).await?;
        let selected = packages
            .iter()
            .find(|p| !p.name.contains("-fx-") && !p.name.contains("-crac-"))
            .ok_or_else(|| {
                AppError::Message(format!(
                    "未找到 Zulu JDK {} 的 Windows x64 zip。",
                    input.version
                ))
            })?;
        return Ok(PackageResource {
            url: selected.download_url.clone(),
            file_name: selected.name.clone(),
            package_type: InstallType::Archive,
            resolved_version: selected
                .java_version
                .iter()
                .map(|v| v.to_string())
                .collect::<Vec<_>>()
                .join("."),
            source_name: Some("Azul Metadata API".into()),
        });
    }

    if vendor == "liberica" {
        let url = format!(
            "https://api.bell-sw.com/v1/liberica/releases?version-feature={}&version-modifier=latest&bitness=64&release-type=all&os=windows&arch=x86&package-type=zip&bundle-type=jdk",
            input.version
        );
        let releases: Vec<LibericaRelease> =
            crate::services::common::network::fetch_json(&url, config).await?;
        let selected = releases
            .iter()
            .find(|r| r.ga && r.package_type == "zip")
            .ok_or_else(|| {
                AppError::Message(format!(
                    "未找到 Liberica JDK {} 的 Windows x64 zip。",
                    input.version
                ))
            })?;
        return Ok(PackageResource {
            url: selected.download_url.clone(),
            file_name: selected.filename.clone(),
            package_type: InstallType::Archive,
            resolved_version: selected.version.clone(),
            source_name: Some("BellSoft Product Discovery API".into()),
        });
    }

    if vendor == "oracle" {
        return Ok(PackageResource {
            url: format!(
                "https://download.oracle.com/java/{}/latest/jdk-{}_windows-x64_bin.zip",
                input.version, input.version
            ),
            file_name: format!("oracle-jdk-{}-windows-x64.zip", input.version),
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some("Oracle Java 下载页".into()),
        });
    }

    Err(AppError::Message(format!("暂不支持该 Java 发行商：{}", vendor)))
}

// ── Lua ──────────────────────────────────────────────────────────────────────

fn resolve_lua(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("luabinaries");
    if vendor != "luabinaries" {
        return Err(AppError::Message("当前自动安装暂只支持 LuaBinaries。".into()));
    }
    let file_name = format!("lua-{}_Win64_bin.zip", input.version);
    let mirror = get_mirror(config, "lua");
    let trimmed = mirror.trim();
    let has_mirror = !trimmed.is_empty() && trimmed != "official";
    let base = if has_mirror {
        trimmed.trim_end_matches('/').to_string()
    } else {
        format!(
            "https://sourceforge.net/projects/luabinaries/files/{}/Tools%20Executables",
            input.version
        )
    };
    let url = if has_mirror {
        format!("{}/{}", base, file_name)
    } else {
        format!("{}/{}/download", base, file_name)
    };
    Ok(PackageResource {
        url,
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("lua", mirror, "LuaBinaries SourceForge")),
    })
}

// ── Maven (async — fetches metadata XML) ─────────────────────────────────────

async fn resolve_maven(
    input: &InstallTaskInput,
    config: &AppConfig,
    _cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    let mirror = get_mirror(config, "maven");
    let trimmed = mirror.trim();
    let repo_base = if !trimmed.is_empty() && trimmed != "official" {
        trimmed.trim_end_matches('/').to_string()
    } else {
        "https://repo.maven.apache.org/maven2".to_string()
    };

    let metadata_url = format!(
        "{}/org/apache/maven/apache-maven/maven-metadata.xml",
        repo_base
    );
    let metadata = crate::services::common::network::fetch_text(&metadata_url, config).await?;

    let versions: Vec<String> = regex_lite::Regex::new(r"<version>([^<]+)</version>")
        .unwrap()
        .captures_iter(&metadata)
        .filter_map(|c| c.get(1).map(|m| m.as_str().to_string()))
        .collect();

    let version = versions
        .iter()
        .rev()
        .find(|v| v.as_str() == input.version || v.starts_with(&format!("{}.", input.version)))
        .ok_or_else(|| AppError::Message(format!("未找到 Maven {} 的发布版本。", input.version)))?;

    let file_name = format!("apache-maven-{}-bin.zip", version);
    Ok(PackageResource {
        url: format!(
            "{}/org/apache/maven/apache-maven/{}/{}",
            repo_base, version, file_name
        ),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: version.clone(),
        source_name: Some(mirror_source_name("maven", mirror, "Maven Central")),
    })
}

// ── MongoDB ──────────────────────────────────────────────────────────────────

fn resolve_mongodb(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("community");
    if vendor != "community" {
        return Err(AppError::Message("当前自动安装暂只支持 MongoDB Community Server。".into()));
    }
    let file_name = format!("mongodb-windows-x86_64-{}.zip", input.version);
    let mirror = get_mirror(config, "mongodb");
    let base = resolve_base_url(mirror, "https://fastdl.mongodb.org/windows");
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("mongodb", mirror, "MongoDB 官方源")),
    })
}

// ── MySQL ────────────────────────────────────────────────────────────────────

fn resolve_mysql(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("community");
    if vendor != "community" {
        return Err(AppError::Message("当前自动安装暂只支持 MySQL Community Server。".into()));
    }
    let file_name = format!("mysql-{}-winx64.zip", input.version);
    let track: String = input.version.split('.').take(2).collect::<Vec<_>>().join(".");
    let mirror = get_mirror(config, "mysql");
    let base = resolve_base_url(mirror, "https://cdn.mysql.com/Downloads");
    Ok(PackageResource {
        url: format!("{}/MySQL-{}/{}", base, track, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("mysql", mirror, "MySQL CDN")),
    })
}

// ── Ninja ────────────────────────────────────────────────────────────────────

fn resolve_ninja(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("ninja-build");
    if vendor != "ninja-build" {
        return Err(AppError::Message("当前自动安装暂只支持 Ninja Build 官方发行版。".into()));
    }
    let mirror = get_mirror(config, "ninja");
    let trimmed = mirror.trim();
    let resolved_version = input.version.trim_start_matches('v').to_string();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        Ok(PackageResource {
            url: format!("{}/ninja-win.zip", base),
            file_name: format!("ninja-{}-win.zip", input.version),
            package_type: InstallType::Archive,
            resolved_version: resolved_version.clone(),
            source_name: Some(mirror_source_name("ninja", mirror, "Ninja GitHub Releases")),
        })
    } else {
        Ok(PackageResource {
            url: format!(
                "https://github.com/ninja-build/ninja/releases/download/{}/ninja-win.zip",
                input.version
            ),
            file_name: format!("ninja-{}-win.zip", input.version),
            package_type: InstallType::Archive,
            resolved_version,
            source_name: Some("Ninja GitHub Releases".into()),
        })
    }
}

// ── Node (async — fetches release index) ─────────────────────────────────────

#[derive(Deserialize)]
struct NodeRelease {
    version: String,
    files: Vec<String>,
}

async fn resolve_node(
    input: &InstallTaskInput,
    config: &AppConfig,
    _cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("nodejs");
    if vendor != "nodejs" {
        return Err(AppError::Message("当前自动安装暂只支持 Node.js 官方发行版。".into()));
    }
    let mirror = get_mirror(config, "node");
    let dist_base = resolve_base_url(mirror, "https://nodejs.org/dist");
    let url = format!("{}/index.json", dist_base);
    let releases: Vec<NodeRelease> =
        crate::services::common::network::fetch_json(&url, config).await?;

    let requested = input.version.trim_start_matches('v');
    let release = releases.iter().find(|r| {
        let v = r.version.trim_start_matches('v');
        v == requested || v.starts_with(&format!("{}.", requested))
    });

    let release = release.ok_or_else(|| {
        AppError::Message(format!(
            "未找到 Node.js {} 的 Windows x64 压缩包。",
            input.version
        ))
    })?;

    if !release.files.iter().any(|f| f == "win-x64-zip") {
        return Err(AppError::Message(format!(
            "Node.js {} 不包含 win-x64-zip 文件。",
            input.version
        )));
    }

    let file_name = format!("{}-win-x64.zip", release.version);
    Ok(PackageResource {
        url: format!("{}/{}/{}", dist_base, release.version, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: release.version.trim_start_matches('v').to_string(),
        source_name: Some(mirror_source_name("node", mirror, "Node.js 官方源")),
    })
}

// ── Nvm ──────────────────────────────────────────────────────────────────────

fn resolve_nvm(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("coreybutler");
    if vendor != "coreybutler" {
        return Err(AppError::Message("当前自动安装暂只支持 nvm-windows。".into()));
    }
    let mirror = get_mirror(config, "nvm");
    let trimmed = mirror.trim();
    let release_base = if !trimmed.is_empty() && trimmed != "official" {
        trimmed.trim_end_matches('/').to_string()
    } else {
        format!(
            "https://github.com/coreybutler/nvm-windows/releases/download/{}",
            input.version
        )
    };
    Ok(PackageResource {
        url: format!("{}/nvm-noinstall.zip", release_base),
        file_name: format!("nvm-windows-{}-noinstall.zip", input.version),
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("nvm", mirror, "GitHub Releases")),
    })
}

// ── PHP ──────────────────────────────────────────────────────────────────────

fn resolve_php(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("windows");
    if vendor != "windows" {
        return Err(AppError::Message("当前自动安装暂只支持 PHP for Windows。".into()));
    }
    let file_name = format!("php-{}-Win32-vs17-x64.zip", input.version);
    let mirror = get_mirror(config, "php");
    let base = resolve_base_url(mirror, "https://windows.php.net/downloads/releases");
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("php", mirror, "PHP for Windows")),
    })
}

// ── PostgreSQL (async — scrapes EDB page) ────────────────────────────────────

async fn resolve_postgresql(
    input: &InstallTaskInput,
    config: &AppConfig,
    _cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("edb");
    if vendor != "edb" {
        return Err(AppError::Message("当前自动安装暂只支持 EDB PostgreSQL Binaries。".into()));
    }
    let file_name = format!("postgresql-{}-windows-x64-binaries.zip", input.version);
    let mirror = get_mirror(config, "postgresql");
    let trimmed = mirror.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        return Ok(PackageResource {
            url: format!("{}/{}", base, file_name),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some(mirror_source_name("postgresql", mirror, "EDB PostgreSQL Binaries")),
        });
    }

    let page = crate::services::common::network::fetch_text(
        "https://www.enterprisedb.com/download-postgresql-binaries",
        config,
    )
    .await?;

    let escaped_version = regex_lite::escape(&input.version);
    let pattern = format!(
        r#"Version\s*(?:<!-- -->)?{}.*?<a href="([^"]+)"><img alt="Windows x86-64""#,
        escaped_version
    );
    let re = regex_lite::Regex::new(&pattern).map_err(|e| {
        AppError::Message(format!("正则构建失败：{}", e))
    })?;
    let url = re
        .captures(&page)
        .and_then(|c| c.get(1))
        .map(|m| m.as_str().replace("&amp;", "&"))
        .map(|u| {
            if u.starts_with("http") {
                u
            } else {
                format!("https://www.enterprisedb.com{}", u)
            }
        })
        .ok_or_else(|| {
            AppError::Message(format!(
                "未找到 PostgreSQL {} 的 Windows x64 二进制包。",
                input.version
            ))
        })?;

    Ok(PackageResource {
        url,
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some("EDB PostgreSQL Binaries".into()),
    })
}

// ── Python ───────────────────────────────────────────────────────────────────

fn resolve_python(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("cpython");
    if vendor != "cpython" {
        return Err(AppError::Message("当前自动安装暂只支持 Python 官方发行版。".into()));
    }
    let file_name = format!("python-{}-amd64.exe", input.version);
    let mirror = get_mirror(config, "python");
    let trimmed = mirror.trim();
    let base = if !trimmed.is_empty() && trimmed != "official" {
        trimmed.trim_end_matches('/').to_string()
    } else {
        "https://www.python.org/ftp/python".to_string()
    };
    Ok(PackageResource {
        url: format!("{}/{}/{}", base, input.version, file_name),
        file_name,
        package_type: InstallType::Installer,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("python", mirror, "Python 官方源")),
    })
}

// ── Redis ────────────────────────────────────────────────────────────────────

fn resolve_redis(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("redis-windows");
    if vendor != "redis-windows" {
        return Err(AppError::Message("当前自动安装暂只支持 Redis Windows 发行版。".into()));
    }
    let file_name = format!("Redis-x64-{}.zip", input.version);
    let mirror = get_mirror(config, "redis");
    let trimmed = mirror.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        Ok(PackageResource {
            url: format!("{}/{}", base, file_name),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some(mirror_source_name("redis", mirror, "Redis Windows GitHub Releases")),
        })
    } else {
        Ok(PackageResource {
            url: format!(
                "https://github.com/tporadowski/redis/releases/download/v{}/{}",
                input.version, file_name
            ),
            file_name,
            package_type: InstallType::Archive,
            resolved_version: input.version.clone(),
            source_name: Some("Redis Windows GitHub Releases".into()),
        })
    }
}

// ── Ruby ─────────────────────────────────────────────────────────────────────

fn resolve_ruby(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("rubyinstaller");
    if vendor != "rubyinstaller" {
        return Err(AppError::Message("当前自动安装暂只支持 RubyInstaller。".into()));
    }
    let file_name = format!("rubyinstaller-devkit-{}-x64.exe", input.version);
    let mirror = get_mirror(config, "ruby");
    let trimmed = mirror.trim();
    if !trimmed.is_empty() && trimmed != "official" {
        let base = trimmed.trim_end_matches('/');
        Ok(PackageResource {
            url: format!("{}/{}", base, file_name),
            file_name,
            package_type: InstallType::Installer,
            resolved_version: input.version.clone(),
            source_name: Some(mirror_source_name("ruby", mirror, "RubyInstaller GitHub Releases")),
        })
    } else {
        Ok(PackageResource {
            url: format!(
                "https://github.com/oneclick/rubyinstaller2/releases/download/RubyInstaller-{}/{}",
                input.version, file_name
            ),
            file_name,
            package_type: InstallType::Installer,
            resolved_version: input.version.clone(),
            source_name: Some("RubyInstaller GitHub Releases".into()),
        })
    }
}

// ── Rust ─────────────────────────────────────────────────────────────────────

fn resolve_rust(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("rustup");
    if vendor != "rustup" {
        return Err(AppError::Message("当前自动安装暂只支持 rustup。".into()));
    }
    let mirror = get_mirror(config, "rust");
    let base = resolve_base_url(
        mirror,
        "https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc",
    );
    Ok(PackageResource {
        url: format!("{}/rustup-init.exe", base),
        file_name: format!("rustup-init-{}.exe", input.version),
        package_type: InstallType::Installer,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("rust", mirror, "Rust 官方源")),
    })
}

// ── SQLite ───────────────────────────────────────────────────────────────────

fn resolve_sqlite(input: &InstallTaskInput, config: &AppConfig) -> AppResult<PackageResource> {
    let vendor = input.vendor.as_deref().unwrap_or("sqlite");
    if vendor != "sqlite" {
        return Err(AppError::Message("当前自动安装暂只支持 SQLite Tools。".into()));
    }
    let file_name = format!("sqlite-tools-win-x64-{}.zip", input.version);
    let mirror = get_mirror(config, "sqlite");
    let base = resolve_base_url(
        mirror,
        &format!("https://www.sqlite.org/{}", chrono::Local::now().format("%Y")),
    );
    Ok(PackageResource {
        url: format!("{}/{}", base, file_name),
        file_name,
        package_type: InstallType::Archive,
        resolved_version: input.version.clone(),
        source_name: Some(mirror_source_name("sqlite", mirror, "SQLite 官方源")),
    })
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

pub async fn resolve_resource(
    input: &InstallTaskInput,
    config: &AppConfig,
    cancel: &CancellationToken,
) -> AppResult<PackageResource> {
    match &input.environment {
        EnvironmentKind::Java => resolve_java(input, config, cancel).await,
        EnvironmentKind::Python => resolve_python(input, config),
        EnvironmentKind::Conda => resolve_conda(input, config),
        EnvironmentKind::Go => resolve_go(input, config, cancel).await,
        EnvironmentKind::Node => resolve_node(input, config, cancel).await,
        EnvironmentKind::Nvm => resolve_nvm(input, config),
        EnvironmentKind::Maven => resolve_maven(input, config, cancel).await,
        EnvironmentKind::Gradle => resolve_gradle(input, config),
        EnvironmentKind::Cmake => resolve_cmake(input, config),
        EnvironmentKind::Ninja => resolve_ninja(input, config),
        EnvironmentKind::Cpp => resolve_cpp(input, config),
        EnvironmentKind::Lua => resolve_lua(input, config),
        EnvironmentKind::Rust => resolve_rust(input, config),
        EnvironmentKind::Dotnet => resolve_dotnet(input, config),
        EnvironmentKind::Php => resolve_php(input, config),
        EnvironmentKind::Ruby => resolve_ruby(input, config),
        EnvironmentKind::Flutter => resolve_flutter(input, config),
        EnvironmentKind::Android => resolve_android(input, config),
        EnvironmentKind::Mysql => resolve_mysql(input, config),
        EnvironmentKind::Postgresql => resolve_postgresql(input, config, cancel).await,
        EnvironmentKind::Mongodb => resolve_mongodb(input, config),
        EnvironmentKind::Redis => resolve_redis(input, config),
        EnvironmentKind::Sqlite => resolve_sqlite(input, config),
    }
}
