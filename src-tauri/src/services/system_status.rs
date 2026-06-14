use std::collections::HashMap;
use serde::Serialize;
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
        #[cfg(windows)]
        {
            is_windows_admin()
        }
        #[cfg(unix)]
        {
            // SAFETY: geteuid() is a simple POSIX syscall with no memory-safety
            // preconditions; it returns an integer UID without touching any buffers.
            unsafe { libc::geteuid() == 0 }
        }
        #[cfg(not(any(windows, unix)))]
        { false }
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

/// Checks whether the current process is running with administrator privileges
/// using the Win32 `CheckTokenMembership` API with the well-known
/// `BUILTIN\Administrators` SID.
///
/// This is the canonical, reliable way to detect admin on Windows — unlike the
/// `net session` trick which fails when the Workstation service is not running
/// (common on VMware VMs, minimal installs, etc.).
#[cfg(windows)]
fn is_windows_admin() -> bool {
    use std::ptr;

    // ── Win32 FFI declarations ──────────────────────────────────────────
    type HANDLE = *mut std::ffi::c_void;
    type BOOL = i32;
    type DWORD = u32;
    type PSID = *mut std::ffi::c_void;

    const WELL_KNOWN_SID_TYPE: i32 = 5; // WinBuiltinAdministratorsSid

    extern "system" {
        fn OpenProcessToken(
            process_handle: HANDLE,
            desired_access: DWORD,
            token_handle: *mut HANDLE,
        ) -> BOOL;

        fn CreateWellKnownSid(
            well_known_sid_type: i32,
            domain_sid: PSID,
            sid: PSID,
            cb_sid: *mut DWORD,
        ) -> BOOL;

        fn CheckTokenMembership(
            token_handle: HANDLE,
            sid_to_check: PSID,
            is_member: *mut BOOL,
        ) -> BOOL;

        fn CloseHandle(handle: HANDLE) -> BOOL;

        fn GetCurrentProcess() -> HANDLE;
    }

    const TOKEN_QUERY: DWORD = 0x0008;

    unsafe {
        // 1. Open the current process token with TOKEN_QUERY access.
        let mut token: HANDLE = ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), TOKEN_QUERY, &mut token) == 0 {
            return false;
        }

        // 2. Create the well-known BUILTIN\Administrators SID (max 68 bytes).
        let mut sid_buf = [0u8; 68];
        let mut sid_size: DWORD = sid_buf.len() as DWORD;
        let ok = CreateWellKnownSid(
            WELL_KNOWN_SID_TYPE,
            ptr::null_mut(),
            sid_buf.as_mut_ptr() as PSID,
            &mut sid_size,
        );
        if ok == 0 {
            CloseHandle(token);
            return false;
        }

        // 3. Check whether the token contains the Administrators SID with
        //    SE_GROUP_ENABLED.
        let mut is_member: BOOL = 0;
        let ok = CheckTokenMembership(
            token,
            sid_buf.as_ptr() as PSID,
            &mut is_member,
        );
        CloseHandle(token);

        ok != 0 && is_member != 0
    }
}
