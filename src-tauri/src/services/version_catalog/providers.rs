#![allow(dead_code)]

use std::collections::HashMap;
use serde::Deserialize;
use crate::error::AppResult;
use crate::shared::types::*;
use crate::services::config::AppConfig;
use crate::services::common::network::*;

// ── Helper ───────────────────────────────────────────────────────────────────

fn create_version(
    environment: EnvironmentKind,
    vendor: &str,
    version: &str,
    label: &str,
    channel: &str,
    package_type: &str,
    notes: Option<&str>,
) -> AvailableVersion {
    AvailableVersion {
        id: format!("{}:{}:{}", environment, vendor, version),
        environment,
        vendor: vendor.to_string(),
        version: version.to_string(),
        label: label.to_string(),
        channel: channel.to_string(),
        package_type: package_type.to_string(),
        architecture: "x64".to_string(),
        notes: notes.map(|s| s.to_string()),
    }
}

fn classify_channel(major: i64, index: usize, lts_majors: &[i64]) -> &'static str {
    if lts_majors.contains(&major) { "lts" }
    else if index == 0 { "current" }
    else { "stable" }
}

// ── GitHub Release ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct GitHubRelease {
    pub tag_name: String,
    pub draft: bool,
    pub prerelease: bool,
    pub assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
pub struct GitHubAsset {
    pub name: String,
}

// ── Java (Temurin) ───────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct AdoptiumReleases {
    available_lts_releases: Vec<i64>,
    available_releases: Vec<i64>,
    most_recent_feature_release: i64,
}

pub async fn list_java_versions(vendor: &str, config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    match vendor {
        "temurin" => list_temurin_versions(config).await,
        "zulu" => list_zulu_versions(config).await,
        _ => Ok(vec![]), // Other vendors use static data
    }
}

async fn list_temurin_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let releases = fetch_json::<AdoptiumReleases>(
        "https://api.adoptium.net/v3/info/available_releases",
        config,
    ).await?;

    let lts_set: std::collections::HashSet<i64> = releases.available_lts_releases.iter().copied().collect();
    let mut majors: Vec<i64> = releases.available_releases;
    majors.sort_by(|a, b| b.cmp(a));
    majors.dedup();

    Ok(majors.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .map(|major| {
            let is_lts = lts_set.contains(&major);
            let channel = if major == releases.most_recent_feature_release { "current" }
                else if is_lts { "lts" }
                else { "stable" };
            let label = if is_lts { format!("JDK {} LTS", major) } else { format!("JDK {}", major) };
            create_version(
                EnvironmentKind::Java, "temurin", &major.to_string(),
                &label, channel, "archive",
                Some("来自 Adoptium 在线版本接口"),
            )
        })
        .collect())
}

// ── Java (Zulu) ──────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct ZuluPackage {
    java_version: Vec<i64>,
    name: String,
}

async fn list_zulu_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let packages = fetch_json::<Vec<ZuluPackage>>(
        "https://api.azul.com/metadata/v1/zulu/packages/?os=windows&arch=x64&java_package_type=jdk&archive_type=zip&release_status=ga&availability_types=CA&page=1&page_size=1000",
        config,
    ).await?;

    let mut latest_by_major: HashMap<i64, &ZuluPackage> = HashMap::new();
    for pkg in packages.iter().filter(|p| !p.name.contains("-fx-") && !p.name.contains("-crac-")) {
        if let Some(&major) = pkg.java_version.first() {
            latest_by_major.entry(major).or_insert(pkg);
        }
    }

    let mut entries: Vec<_> = latest_by_major.into_iter().collect();
    entries.sort_by(|(a, _), (b, _)| b.cmp(a));

    let lts_majors = [21i64, 17, 11, 8];
    Ok(entries.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .enumerate()
        .map(|(index, (major, pkg))| {
            let version_str = pkg.java_version.iter().map(|n| n.to_string()).collect::<Vec<_>>().join(".");
            create_version(
                EnvironmentKind::Java, "zulu", &major.to_string(),
                &format!("Zulu JDK {}", major),
                classify_channel(major, index, &lts_majors),
                "archive",
                Some(&format!("最新补丁版本 {}，来自 Azul Metadata API", version_str)),
            )
        })
        .collect())
}

// ── Node.js ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct NodeRelease {
    version: String,
    lts: serde_json::Value, // false or string
    files: Vec<String>,
}

pub async fn list_node_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let releases = fetch_json::<Vec<NodeRelease>>(
        "https://nodejs.org/dist/index.json",
        config,
    ).await?;

    let mut latest_by_major: HashMap<String, &NodeRelease> = HashMap::new();
    for release in releases.iter().filter(|r| r.files.contains(&"win-x64-zip".to_string())) {
        let major = release.version.trim_start_matches('v').split('.').next().unwrap_or("0").to_string();
        latest_by_major.entry(major).or_insert(release);
    }

    let mut entries: Vec<_> = latest_by_major.into_iter().collect();
    entries.sort_by(|(a, _), (b, _)| {
        let a_num: i64 = a.parse().unwrap_or(0);
        let b_num: i64 = b.parse().unwrap_or(0);
        b_num.cmp(&a_num)
    });

    Ok(entries.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .enumerate()
        .map(|(index, (major, release))| {
            let is_lts = !release.lts.is_boolean();
            let channel = if is_lts { "lts" } else if index == 0 { "current" } else { "stable" };
            let label = if is_lts {
                let lts_name = release.lts.as_str().unwrap_or("LTS");
                format!("Node.js {} {} LTS", major, lts_name)
            } else {
                format!("Node.js {}", major)
            };
            create_version(
                EnvironmentKind::Node, "nodejs", &major,
                &label, channel, "archive",
                Some("来自 Node.js 官方 dist 目录"),
            )
        })
        .collect())
}

// ── Go ───────────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct GoRelease {
    version: String,
    stable: Option<bool>,
    files: Vec<GoFile>,
}

#[derive(Debug, Deserialize)]
struct GoFile {
    os: String,
    arch: String,
    kind: String,
}

pub async fn list_go_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let (releases, source_name) = fetch_json_from_sources::<Vec<GoRelease>>(
        &[
            FetchSource { name: "Go 官方源".into(), url: "https://go.dev/dl/?mode=json&include=all".into() },
            FetchSource { name: "Go 中国镜像".into(), url: "https://golang.google.cn/dl/?mode=json&include=all".into() },
        ],
        config,
    ).await?;

    let minor_versions: Vec<String> = unique(
        &releases.iter()
            .filter(|r| r.stable.unwrap_or(true))
            .filter(|r| r.files.iter().any(|f| f.os == "windows" && f.arch == "amd64" && f.kind == "archive"))
            .map(|r| {
                r.version.trim_start_matches("go")
                    .split('.')
                    .take(2)
                    .collect::<Vec<_>>()
                    .join(".")
            })
            .collect::<Vec<_>>(),
    );

    Ok(minor_versions.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .map(|version| create_version(
            EnvironmentKind::Go, "golang", &version,
            &format!("Go {}", version), "stable", "archive",
            Some(&format!("来自 {}", source_name)),
        ))
        .collect())
}

// ── Python ───────────────────────────────────────────────────────────────────

pub async fn list_python_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let listing = fetch_text("https://www.python.org/ftp/python/", config).await?;

    // Extract version directories like href="3.12.1/"
    let mut versions: Vec<String> = Vec::new();
    for cap in regex_matches(&listing, r#"href="(\d+\.\d+\.\d+)/""#) {
        if cap.starts_with("3.") {
            versions.push(cap);
        }
    }
    versions = unique(&versions);
    versions.sort_by(|a, b| compare_versions_desc(a, b));

    // Get latest patch per minor series
    let mut latest_by_series: HashMap<String, String> = HashMap::new();
    for version in &versions {
        let series = version.split('.').take(2).collect::<Vec<_>>().join(".");
        latest_by_series.entry(series).or_insert(version.clone());
    }

    let mut selected: Vec<String> = latest_by_series.into_values().collect();
    selected.sort_by(|a, b| compare_versions_desc(a, b));

    Ok(selected.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .enumerate()
        .map(|(index, version)| create_version(
            EnvironmentKind::Python, "cpython", &version,
            &format!("Python {}", version),
            if index == 0 { "current" } else { "stable" },
            "installer",
            Some("来自 Python.org FTP 目录"),
        ))
        .collect())
}

// ── GitHub-based providers (CMake, Gradle, Ninja, etc.) ─────────────────────

pub async fn list_github_versions(
    environment: &EnvironmentKind,
    vendor: &str,
    repo: &str,
    label_prefix: &str,
    windows_asset_check: fn(&str, &str) -> bool,
    config: &AppConfig,
) -> AppResult<Vec<AvailableVersion>> {
    let releases = fetch_json::<Vec<GitHubRelease>>(
        &format!("https://api.github.com/repos/{}/releases?per_page=40", repo),
        config,
    ).await?;

    let versions: Vec<String> = releases.iter()
        .filter(|r| !r.draft && !r.prerelease)
        .map(|r| r.tag_name.trim_start_matches('v').to_string())
        .collect();

    let unique_versions = unique(&versions);

    Ok(unique_versions.into_iter()
        .filter(|version| {
            releases.iter().any(|r| r.assets.iter().any(|a| windows_asset_check(&a.name, version)))
        })
        .take(MAX_VERSION_OPTIONS)
        .enumerate()
        .map(|(index, version)| create_version(
            environment.clone(), vendor, &version,
            &format!("{} {}", label_prefix, version),
            if index == 0 { "current" } else { "stable" },
            "archive",
            None,
        ))
        .collect())
}

// ── Maven (XML metadata) ────────────────────────────────────────────────────

pub async fn list_maven_versions(config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    let metadata = fetch_text(
        "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/maven-metadata.xml",
        config,
    ).await?;

    let mut versions: Vec<String> = regex_matches(&metadata, r"<version>(3\.\d+\.\d+)</version>")
        .into_iter()
        .collect();
    versions = unique(&versions);
    versions.sort_by(|a, b| compare_versions_desc(a, b));

    Ok(versions.into_iter()
        .take(MAX_VERSION_OPTIONS)
        .map(|version| create_version(
            EnvironmentKind::Maven, "apache", &version,
            &format!("Maven {}", version), "stable", "archive",
            Some("来自 Maven Central metadata"),
        ))
        .collect())
}

// ── Conda ────────────────────────────────────────────────────────────────────

pub async fn list_conda_versions(vendor: &str, config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    match vendor {
        "anaconda" => {
            let listing = fetch_text("https://repo.anaconda.com/archive/", config).await?;
            let mut versions: Vec<String> = regex_matches(&listing, r"Anaconda3-(\d{4}\.\d+(?:-\d+)?)-Windows-x86_64\.exe");
            versions = unique(&versions);
            versions.sort_by(|a, b| compare_versions_desc(a, b));

            let selected = if versions.is_empty() { vec!["latest".to_string()] } else { versions };
            Ok(selected.into_iter().take(MAX_VERSION_OPTIONS).map(|version| {
                let label = if version == "latest" { "Anaconda Distribution".to_string() } else { format!("Anaconda {}", version) };
                create_version(EnvironmentKind::Conda, "anaconda", &version, &label, "stable", "installer", Some("来自 Anaconda archive 目录"))
            }).collect())
        }
        "miniconda" => {
            let listing = fetch_text("https://repo.anaconda.com/miniconda/", config).await?;
            let mut versions: Vec<String> = regex_matches(&listing, r"Miniconda3-(py\d+_\d+\.\d+\.\d+(?:-\d+)?)-Windows-x86_64\.exe");
            versions = unique(&versions);
            versions.sort_by(|a, b| compare_versions_desc(a, b));

            let selected = if versions.is_empty() { vec!["latest".to_string()] } else { versions };
            Ok(selected.into_iter().take(MAX_VERSION_OPTIONS).map(|version| {
                let label = if version == "latest" { "Miniconda 最新版".to_string() } else { format!("Miniconda {}", version) };
                create_version(EnvironmentKind::Conda, "miniconda", &version, &label, "stable", "installer", Some("来自 Anaconda miniconda 目录"))
            }).collect())
        }
        _ => Ok(vec![]),
    }
}

// ── C++ (LLVM-MinGW) ────────────────────────────────────────────────────────

pub async fn list_cpp_versions(vendor: &str, config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    match vendor {
        "llvm-mingw" => {
            let releases = fetch_json::<Vec<GitHubRelease>>(
                "https://api.github.com/repos/mstorsjo/llvm-mingw/releases?per_page=40",
                config,
            ).await?;

            let asset_re = regex_lite::Regex::new(r"^llvm-mingw-\d+-ucrt-x86_64\.zip$").unwrap();
            Ok(releases.iter()
                .filter(|r| !r.draft && !r.prerelease)
                .filter(|r| r.assets.iter().any(|a| asset_re.is_match(&a.name)))
                .take(MAX_VERSION_OPTIONS)
                .map(|r| create_version(
                    EnvironmentKind::Cpp, "llvm-mingw", &r.tag_name,
                    &format!("LLVM-MinGW {}", r.tag_name), "stable", "archive",
                    Some("来自 LLVM-MinGW GitHub Releases API"),
                ))
                .collect())
        }
        _ => Ok(vec![]),
    }
}

// ── Lua ─────────────────────────────────────────────────────────────────────

pub async fn list_lua_versions(vendor: &str, config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    match vendor {
        "luabinaries" => {
            let releases = fetch_json::<Vec<GitHubRelease>>(
                "https://api.github.com/repos/lua/lua/releases?per_page=40",
                config,
            ).await?;

            let version_re = regex_lite::Regex::new(r"^\d+\.\d+\.\d+$").unwrap();
            let mut versions: Vec<String> = releases.iter()
                .filter(|r| !r.draft && !r.prerelease)
                .map(|r| r.tag_name.trim_start_matches('v').to_string())
                .filter(|v| version_re.is_match(v))
                .collect();
            versions = unique(&versions);
            versions.sort_by(|a, b| compare_versions_desc(a, b));

            Ok(versions.into_iter()
                .take(MAX_VERSION_OPTIONS)
                .enumerate()
                .map(|(index, version)| create_version(
                    EnvironmentKind::Lua, "luabinaries", &version,
                    &format!("Lua {}", version),
                    if index == 0 { "current" } else { "stable" },
                    "archive",
                    Some("版本来自 Lua GitHub Releases，Windows 包来自 LuaBinaries"),
                ))
                .collect())
        }
        _ => Ok(vec![]),
    }
}

// ── Rust (rustup) ───────────────────────────────────────────────────────────

pub async fn list_rust_versions(vendor: &str, _config: &AppConfig) -> AppResult<Vec<AvailableVersion>> {
    match vendor {
        "rustup" => {
            Ok(vec![
                create_version(EnvironmentKind::Rust, "rustup", "stable", "Rust stable", "stable", "installer", Some("由 rustup 安装稳定工具链")),
                create_version(EnvironmentKind::Rust, "rustup", "beta", "Rust beta", "current", "installer", Some("由 rustup 安装 beta 工具链")),
                create_version(EnvironmentKind::Rust, "rustup", "nightly", "Rust nightly", "current", "installer", Some("由 rustup 安装 nightly 工具链")),
            ])
        }
        _ => Ok(vec![]),
    }
}

// ── Simple regex helper ──────────────────────────────────────────────────────

fn regex_matches(text: &str, pattern: &str) -> Vec<String> {
    let mut results = Vec::new();
    if let Ok(re) = regex_lite::Regex::new(pattern) {
        for cap in re.captures_iter(text) {
            if let Some(m) = cap.get(1) {
                results.push(m.as_str().to_string());
            }
        }
    }
    results
}
