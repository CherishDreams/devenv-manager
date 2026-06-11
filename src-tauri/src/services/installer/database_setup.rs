use tokio::fs;
use tokio_util::sync::CancellationToken;
use crate::error::{AppError, AppResult};
use crate::shared::types::*;
use super::file_system::path_exists;
use super::environment_metadata::compare_version;
use super::process::run_process;

const CONFIG_START: &str = "# >>> Env Manager database config >>>";
const CONFIG_END: &str = "# <<< Env Manager database config <<<";

fn to_config_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn quote_config_value(value: &str) -> String {
    format!("\"{}\"", value.replace('"', "\\\""))
}

fn normalize_port(port: u16) -> AppResult<u16> {
    if port == 0 {
        return Err(AppError::Message("数据库端口必须在 1 到 65535 之间。".into()));
    }
    Ok(port)
}

fn normalize_bind_address(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "127.0.0.1".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_service_name(value: &str, environment: &str) -> AppResult<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::Message("注册 Windows 服务时必须填写服务名。".into()));
    }
    if !trimmed.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '.' || c == '-') {
        return Err(AppError::Message(format!(
            "{} 服务名只能包含英文字母、数字、下划线、点或短横线。",
            environment
        )));
    }
    Ok(trimmed.to_string())
}

async fn directory_has_entries(path: &str) -> AppResult<bool> {
    if !path_exists(path).await {
        return Ok(false);
    }
    let mut entries = fs::read_dir(path).await?;
    Ok(entries.next_entry().await?.is_some())
}

async fn append_generated_block(path: &str, lines: &[&str]) -> AppResult<()> {
    let mut all_lines = vec![CONFIG_START];
    all_lines.extend_from_slice(lines);
    all_lines.push(CONFIG_END);
    let block = all_lines.join("\r\n");

    let current = if path_exists(path).await {
        fs::read_to_string(path).await?
    } else {
        String::new()
    };

    let pattern = format!(r"{}[\s\S]*?{}", regex_lite::escape(CONFIG_START), regex_lite::escape(CONFIG_END));
    let re = regex_lite::Regex::new(&pattern).unwrap();
    let next = if re.is_match(&current) {
        re.replace(&current, block.as_str()).to_string()
    } else {
        format!("{}\r\n{}\r\n", current.trim_end(), block)
    };

    fs::write(path, next).await?;
    Ok(())
}

async fn start_windows_service(service_name: &str, cancel: &CancellationToken) -> AppResult<()> {
    run_process("net.exe", &["start", service_name], cancel, None).await?;
    Ok(())
}

fn is_configurable_db(env: &EnvironmentKind) -> bool {
    matches!(
        env,
        EnvironmentKind::Mysql
            | EnvironmentKind::Postgresql
            | EnvironmentKind::Mongodb
            | EnvironmentKind::Redis
    )
}

fn default_db_config(env: &EnvironmentKind) -> DatabaseInstallConfig {
    let (port, charset) = match env {
        EnvironmentKind::Mysql => (3306, "utf8mb4"),
        EnvironmentKind::Postgresql => (5432, "UTF8"),
        EnvironmentKind::Mongodb => (27017, ""),
        EnvironmentKind::Redis => (6379, ""),
        _ => (0, ""),
    };
    DatabaseInstallConfig {
        enabled: true,
        install_as_service: false,
        start_service: false,
        service_name: String::new(),
        port,
        bind_address: "127.0.0.1".to_string(),
        charset: charset.to_string(),
        collation: None,
    }
}

fn merge_db_config(
    default: &DatabaseInstallConfig,
    override_cfg: &Option<DatabaseInstallConfig>,
) -> DatabaseInstallConfig {
    if let Some(o) = override_cfg {
        DatabaseInstallConfig {
            enabled: o.enabled,
            install_as_service: o.install_as_service,
            start_service: o.start_service,
            service_name: if o.service_name.is_empty() {
                default.service_name.clone()
            } else {
                o.service_name.clone()
            },
            port: if o.port == 0 { default.port } else { o.port },
            bind_address: if o.bind_address.is_empty() {
                default.bind_address.clone()
            } else {
                o.bind_address.clone()
            },
            charset: if o.charset.is_empty() {
                default.charset.clone()
            } else {
                o.charset.clone()
            },
            collation: o.collation.clone().or_else(|| default.collation.clone()),
        }
    } else {
        default.clone()
    }
}

// ── MySQL ────────────────────────────────────────────────────────────────────

async fn setup_mysql(
    input: &InstallTaskInput,
    install_path: &str,
    config: &DatabaseInstallConfig,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
    cancel: &CancellationToken,
) -> AppResult<()> {
    let data_dir = format!("{}\\data", install_path);
    let my_cnf = format!("{}\\my.cnf", install_path);
    let my_ini = format!("{}\\my.ini", install_path);
    let mysqld = format!("{}\\bin\\mysqld.exe", install_path);
    let charset = if config.charset.is_empty() { "utf8mb4" } else { &config.charset };

    let mut lines = vec![
        "[mysqld]".to_string(),
        format!("basedir={}", to_config_path(install_path)),
        format!("datadir={}", to_config_path(&data_dir)),
        format!("port={}", config.port),
        format!("bind-address={}", config.bind_address),
        format!("character-set-server={}", charset),
    ];
    if let Some(ref collation) = config.collation {
        if !collation.is_empty() {
            lines.push(format!("collation-server={}", collation));
        }
    }
    lines.push("explicit_defaults_for_timestamp=ON".to_string());
    lines.push(String::new());
    lines.push("[client]".to_string());
    lines.push(format!("port={}", config.port));
    lines.push(format!("default-character-set={}", charset));
    lines.push(String::new());

    fs::write(&my_cnf, lines.join("\r\n")).await?;
    fs::copy(&my_cnf, &my_ini).await?;
    on_log(&format!("已写入 MySQL 配置：{}", my_cnf), "info");

    let data_has_content = directory_has_entries(&data_dir).await?;
    if !data_has_content && compare_version(&input.version, "5.7.0") != std::cmp::Ordering::Less {
        if path_exists(&data_dir).await {
            fs::remove_dir_all(&data_dir).await?;
        }
        on_log("正在初始化 MySQL data 目录，默认 root 为空密码。", "info");
        run_process(
            &mysqld,
            &[
                &format!("--defaults-file={}", my_cnf),
                "--initialize-insecure",
                "--console",
            ],
            cancel,
            None,
        )
        .await?;
    } else if !data_has_content {
        on_log("当前 MySQL 历史版本未自动初始化 data 目录，将使用压缩包自带目录。", "warn");
    }

    if !config.install_as_service {
        on_log("MySQL 未注册 Windows 服务，可使用 mysqld --defaults-file 启动。", "info");
        return Ok(());
    }

    let svc_name = normalize_service_name(&config.service_name, "mysql")?;
    run_process(
        &mysqld,
        &[&format!("--defaults-file={}", my_cnf), "--install", &svc_name],
        cancel,
        None,
    )
    .await?;
    on_log(&format!("已注册 MySQL Windows 服务：{}", svc_name), "info");

    if config.start_service {
        start_windows_service(&svc_name, cancel).await?;
        on_log(&format!("已启动 MySQL Windows 服务：{}", svc_name), "info");
    }
    Ok(())
}

// ── PostgreSQL ───────────────────────────────────────────────────────────────

async fn setup_postgresql(
    install_path: &str,
    config: &DatabaseInstallConfig,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
    cancel: &CancellationToken,
) -> AppResult<()> {
    let data_dir = format!("{}\\data", install_path);
    let initdb = format!("{}\\bin\\initdb.exe", install_path);
    let pg_ctl = format!("{}\\bin\\pg_ctl.exe", install_path);
    let config_path = format!("{}\\postgresql.conf", data_dir);
    let charset = if config.charset.is_empty() { "UTF8" } else { &config.charset };
    let locale = config.collation.as_deref().unwrap_or("C");

    let data_has_content = directory_has_entries(&data_dir).await?;
    if !data_has_content {
        if path_exists(&data_dir).await {
            fs::remove_dir_all(&data_dir).await?;
        }
        on_log("正在初始化 PostgreSQL data 目录，默认用户 postgres，认证方式 trust。", "info");
        let locale_arg = if locale == "C" {
            "--no-locale".to_string()
        } else {
            format!("--locale={}", locale)
        };
        run_process(
            &initdb,
            &["-D", &data_dir, "-U", "postgres", "-A", "trust", "-E", charset, &locale_arg],
            cancel,
            None,
        )
        .await?;
    }

    append_generated_block(
        &config_path,
        &[
            &format!("listen_addresses = '{}'", config.bind_address),
            &format!("port = {}", config.port),
            &format!("client_encoding = '{}'", charset),
        ],
    )
    .await?;
    on_log(&format!("已写入 PostgreSQL 配置：{}", config_path), "info");

    if !config.install_as_service {
        on_log("PostgreSQL 未注册 Windows 服务，可使用 pg_ctl 指定 data 目录启动。", "info");
        return Ok(());
    }

    let svc_name = normalize_service_name(&config.service_name, "postgresql")?;
    run_process(
        &pg_ctl,
        &["register", "-N", &svc_name, "-D", &data_dir],
        cancel,
        None,
    )
    .await?;
    on_log(&format!("已注册 PostgreSQL Windows 服务：{}", svc_name), "info");

    if config.start_service {
        start_windows_service(&svc_name, cancel).await?;
        on_log(&format!("已启动 PostgreSQL Windows 服务：{}", svc_name), "info");
    }
    Ok(())
}

// ── MongoDB ──────────────────────────────────────────────────────────────────

async fn setup_mongodb(
    install_path: &str,
    config: &DatabaseInstallConfig,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
    cancel: &CancellationToken,
) -> AppResult<()> {
    let data_dir = format!("{}\\data", install_path);
    let log_dir = format!("{}\\log", install_path);
    let config_path = format!("{}\\mongod.cfg", install_path);
    let mongod = format!("{}\\bin\\mongod.exe", install_path);

    fs::create_dir_all(&data_dir).await?;
    fs::create_dir_all(&log_dir).await?;

    let log_path = format!("{}\\mongod.log", log_dir);
    let cfg = format!(
        "systemLog:\r\n  destination: file\r\n  path: {}\r\n  logAppend: true\r\nstorage:\r\n  dbPath: {}\r\nnet:\r\n  bindIp: {}\r\n  port: {}\r\n",
        quote_config_value(&to_config_path(&log_path)),
        quote_config_value(&to_config_path(&data_dir)),
        config.bind_address,
        config.port,
    );
    fs::write(&config_path, &cfg).await?;
    on_log(&format!("已写入 MongoDB 配置：{}", config_path), "info");

    if !config.install_as_service {
        on_log("MongoDB 未注册 Windows 服务，可使用 mongod --config 启动。", "info");
        return Ok(());
    }

    let svc_name = normalize_service_name(&config.service_name, "mongodb")?;
    run_process(
        &mongod,
        &[
            "--config", &config_path,
            "--install",
            "--serviceName", &svc_name,
            "--serviceDisplayName", &svc_name,
        ],
        cancel,
        None,
    )
    .await?;
    on_log(&format!("已注册 MongoDB Windows 服务：{}", svc_name), "info");

    if config.start_service {
        start_windows_service(&svc_name, cancel).await?;
        on_log(&format!("已启动 MongoDB Windows 服务：{}", svc_name), "info");
    }
    Ok(())
}

// ── Redis ────────────────────────────────────────────────────────────────────

async fn setup_redis(
    install_path: &str,
    config: &DatabaseInstallConfig,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
    cancel: &CancellationToken,
) -> AppResult<()> {
    let data_dir = format!("{}\\data", install_path);
    let config_path = format!("{}\\redis.windows.conf", install_path);
    let redis_server = format!("{}\\redis-server.exe", install_path);
    let log_path = format!("{}\\redis-server.log", install_path);

    fs::create_dir_all(&data_dir).await?;

    let cfg = format!(
        "bind {}\r\nport {}\r\ndir {}\r\nlogfile {}\r\ndatabases 16\r\n",
        config.bind_address,
        config.port,
        quote_config_value(&to_config_path(&data_dir)),
        quote_config_value(&to_config_path(&log_path)),
    );
    fs::write(&config_path, &cfg).await?;
    on_log(&format!("已写入 Redis 配置：{}", config_path), "info");

    if !config.install_as_service {
        on_log("Redis 未注册 Windows 服务，可使用 redis-server.exe redis.windows.conf 启动。", "info");
        return Ok(());
    }

    let svc_name = normalize_service_name(&config.service_name, "redis")?;
    run_process(
        &redis_server,
        &["--service-install", &config_path, "--service-name", &svc_name],
        cancel,
        None,
    )
    .await?;
    on_log(&format!("已注册 Redis Windows 服务：{}", svc_name), "info");

    if config.start_service {
        run_process(
            &redis_server,
            &["--service-start", "--service-name", &svc_name],
            cancel,
            None,
        )
        .await?;
        on_log(&format!("已启动 Redis Windows 服务：{}", svc_name), "info");
    }
    Ok(())
}

// ── Dispatcher ───────────────────────────────────────────────────────────────

pub async fn apply_database_install_config(
    input: &InstallTaskInput,
    install_path: &str,
    on_log: &(dyn Fn(&str, &str) + Send + Sync),
    cancel: &CancellationToken,
) -> AppResult<()> {
    if !is_configurable_db(&input.environment) {
        return Ok(());
    }

    let default = default_db_config(&input.environment);
    let merged = merge_db_config(&default, &input.database_config);

    let port = normalize_port(merged.port)?;
    let bind_address = normalize_bind_address(&merged.bind_address);
    let service_name = if merged.install_as_service {
        normalize_service_name(&merged.service_name, &input.environment.to_string())?
    } else {
        merged.service_name.clone()
    };
    let charset = merged.charset.trim().to_string();
    let collation = merged.collation.as_ref().map(|s| s.trim().to_string());

    let config = DatabaseInstallConfig {
        enabled: merged.enabled,
        install_as_service: merged.install_as_service,
        start_service: merged.start_service,
        service_name,
        port,
        bind_address,
        charset,
        collation,
    };

    if !config.enabled {
        on_log("已跳过数据库运行配置。", "warn");
        return Ok(());
    }

    match input.environment {
        EnvironmentKind::Mysql => setup_mysql(input, install_path, &config, on_log, cancel).await,
        EnvironmentKind::Postgresql => setup_postgresql(install_path, &config, on_log, cancel).await,
        EnvironmentKind::Mongodb => setup_mongodb(install_path, &config, on_log, cancel).await,
        EnvironmentKind::Redis => setup_redis(install_path, &config, on_log, cancel).await,
        _ => Err(AppError::Message("数据库环境不支持".to_string())),
    }
}
