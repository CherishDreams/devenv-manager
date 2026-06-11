use std::collections::HashMap;
use serde::Serialize;
use tokio::process::Command;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
pub struct SystemStatus {
    pub platform: String,
    pub arch: String,
    pub is_windows: bool,
    pub is_administrator: bool,
    pub system_drive: String,
    pub env: HashMap<String, Option<String>>,
}

pub struct SystemStatusService;

impl SystemStatusService {
    pub fn new() -> Self {
        Self
    }

    pub async fn is_administrator(&self) -> bool {
        if cfg!(windows) {
            // On Windows, check if we can run net session
            Command::new("net")
                .arg("session")
                .creation_flags(0x0800_0000) // CREATE_NO_WINDOW
                .output()
                .await
                .map(|output| output.status.success())
                .unwrap_or(false)
        } else {
            // On Unix, check if uid is 0
            #[cfg(unix)]
            { unsafe { libc::geteuid() == 0 } }
            #[cfg(not(unix))]
            { false }
        }
    }

    pub async fn get_status(&self) -> AppResult<SystemStatus> {
        let keys = [
            "JAVA_HOME",
            "PYTHON_HOME",
            "CONDA_HOME",
            "GOROOT",
            "NODE_HOME",
            "NVM_HOME",
            "NVM_SYMLINK",
            "MAVEN_HOME",
            "LLVM_MINGW_HOME",
            "LUA_HOME",
            "MYSQL_HOME",
            "PG_HOME",
            "Path",
            "PATH",
        ];

        let env: HashMap<String, Option<String>> = keys
            .iter()
            .map(|key| {
                let value = std::env::var(key).ok();
                (key.to_string(), value)
            })
            .collect();

        Ok(SystemStatus {
            platform: std::env::consts::OS.to_string(),
            arch: std::env::consts::ARCH.to_string(),
            is_windows: cfg!(windows),
            is_administrator: self.is_administrator().await,
            system_drive: std::env::var("SystemDrive").unwrap_or_else(|_| "C:".to_string()),
            env,
        })
    }
}
