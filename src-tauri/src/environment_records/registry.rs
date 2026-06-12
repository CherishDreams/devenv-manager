//! Windows machine-level environment variable registry operations.
//!
//! Translates the TypeScript `registryEnvironment.ts` to use the `winreg` crate
//! instead of spawning `reg.exe` processes.  All blocking registry calls are
//! dispatched through `tokio::task::spawn_blocking` so the async runtime is
//! never stalled.

#![allow(dead_code)]

use std::collections::HashMap;

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};
use winreg::enums::*;
use winreg::RegKey;

use crate::error::{AppError, AppResult};
use crate::shared::types::{EnvironmentApplyPlan, EnvironmentCleanupPlan};

// ── Constants ────────────────────────────────────────────────────────────────

const MACHINE_ENV_KEY: &str =
    "SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";

// ── Helper functions ─────────────────────────────────────────────────────────

/// Normalize a single path entry for comparison: trim, strip trailing
/// slashes / backslashes, and lowercase.
fn normalize_path_entry(value: &str) -> String {
    let trimmed = value.trim();
    let stripped = trimmed.trim_end_matches(|c| c == '\\' || c == '/');
    stripped.to_lowercase()
}

/// Split a Windows `PATH`-style value by `';'`, trimming whitespace and
/// discarding empty segments.
fn split_path_value(value: Option<&str>) -> Vec<String> {
    value
        .unwrap_or("")
        .split(';')
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Compute a new `PATH` value by removing entries that match `remove` (by
/// normalized comparison) and appending entries from `add` that are not
/// already present.
fn update_path_value(current: Option<&str>, remove: &[String], add: &[String]) -> String {
    let remove_set: std::collections::HashSet<String> =
        remove.iter().map(|e| normalize_path_entry(e)).collect();

    let mut entries: Vec<String> = split_path_value(current)
        .into_iter()
        .filter(|e| !remove_set.contains(&normalize_path_entry(e)))
        .collect();

    let existing: std::collections::HashSet<String> =
        entries.iter().map(|e| normalize_path_entry(e)).collect();

    for entry in add {
        let normalized = normalize_path_entry(entry);
        if !existing.contains(&normalized) {
            entries.push(entry.clone());
        }
    }

    entries.join(";")
}

/// Decode a raw registry value's bytes as a NUL-terminated UTF-16LE string.
/// Handles both `REG_SZ` and `REG_EXPAND_SZ` payloads.
fn decode_reg_value_utf16le(bytes: &[u16]) -> String {
    let mut s = String::from_utf16_lossy(bytes);
    // Strip trailing NUL that Windows typically appends.
    if s.ends_with('\0') {
        s.pop();
    }
    s
}

// ── Core registry operations (blocking, dispatched via spawn_blocking) ───────

/// Read multiple named values from the machine environment registry key.
///
/// Returns a map of `name -> Option<String>`.  A value of `None` means the
/// entry does not exist or could not be decoded.  If the key itself cannot be
/// opened every value maps to `None`.
async fn read_machine_env_values(
    names: &[&str],
) -> AppResult<HashMap<String, Option<String>>> {
    let owned: Vec<String> = names.iter().map(|s| (*s).to_string()).collect();

    tokio::task::spawn_blocking(move || {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let key = match hklm.open_subkey_with_flags(MACHINE_ENV_KEY, KEY_READ) {
            Ok(k) => k,
            Err(_) => {
                // Key not found or access denied – return all None.
                return owned.into_iter().map(|n| (n, None)).collect();
            }
        };

        let mut result = HashMap::new();
        for name in &owned {
            let value = match key.get_raw_value(name.as_str()) {
                Ok(raw)
                    if raw.vtype == REG_SZ || raw.vtype == REG_EXPAND_SZ =>
                {
                    // Decode UTF-16LE bytes, preserving %VAR% references.
                    let words: Vec<u16> = raw
                        .bytes
                        .chunks_exact(2)
                        .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]))
                        .collect();
                    Some(decode_reg_value_utf16le(&words))
                }
                Ok(_) => None, // Unsupported value type.
                Err(_) => None, // Value does not exist.
            };
            result.insert(name.clone(), value);
        }
        result
    })
    .await
    .map_err(|e| AppError::Message(format!("spawn_blocking join error: {e}")))
}

/// Write a single named value to the machine environment registry key.
///
/// When `is_expand` is `true` the value is stored as `REG_EXPAND_SZ` so that
/// `%VAR%` references are preserved; otherwise it is stored as `REG_SZ`.
async fn write_machine_env_value(
    name: &str,
    value: &str,
    is_expand: bool,
) -> AppResult<()> {
    let name = name.to_string();
    let value = value.to_string();

    tokio::task::spawn_blocking(move || {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let key =
            hklm.open_subkey_with_flags(MACHINE_ENV_KEY, KEY_WRITE)?;

        if is_expand {
            // Build a NUL-terminated UTF-16LE payload for REG_EXPAND_SZ.
            let mut wide: Vec<u16> = value.encode_utf16().collect();
            wide.push(0);
            let bytes: Vec<u8> =
                wide.iter().flat_map(|w| w.to_le_bytes()).collect();

            let reg_value = winreg::RegValue {
                vtype: REG_EXPAND_SZ,
                bytes,
            };
            key.set_raw_value(&name, &reg_value)?;
        } else {
            key.set_value::<String, _>(&name, &value)?;
        }
        Ok(())
    })
    .await
    .map_err(|e| AppError::Message(format!("spawn_blocking join error: {e}")))?
}

/// Delete a single named value from the machine environment registry key.
async fn delete_machine_env_value(name: &str) -> AppResult<()> {
    let name = name.to_string();

    tokio::task::spawn_blocking(move || {
        let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
        let key =
            hklm.open_subkey_with_flags(MACHINE_ENV_KEY, KEY_WRITE)?;
        key.delete_value(&name)?;
        Ok(())
    })
    .await
    .map_err(|e| AppError::Message(format!("spawn_blocking join error: {e}")))?
}

/// Create a timestamped backup of the machine environment registry key using
/// `reg.exe export`.
async fn backup_registry(app_handle: &AppHandle) -> AppResult<()> {
    let backup_dir = app_handle
        .path()
        .resolve("registry-backups", BaseDirectory::AppData)?;

    // Ensure the backup directory exists.
    tokio::fs::create_dir_all(&backup_dir).await?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let file_path = backup_dir.join(format!("environment-{timestamp}.reg"));
    let file_str = file_path
        .to_string_lossy()
        .to_string();

    let status = tokio::process::Command::new("reg")
        .args([
            "export",
            &format!("\"HKLM\\{MACHINE_ENV_KEY}\""),
            &file_str,
            "/y",
        ])
        .status()
        .await?;

    if !status.success() {
        return Err(AppError::Message(format!(
            "reg.exe export failed with status: {status}"
        )));
    }
    Ok(())
}

// ── Public API ───────────────────────────────────────────────────────────────

/// Check whether applying `plan` would actually change any machine-level
/// registry values.
pub async fn registry_needs_update(plan: &EnvironmentApplyPlan) -> AppResult<bool> {
    let keys: Vec<&str> = plan.env_vars.keys().map(|k| k.as_str()).collect();
    let mut names: Vec<&str> = keys.clone();
    names.push("Path");

    let current = read_machine_env_values(&names).await?;

    // Compare each env_var value.
    for (name, desired) in &plan.env_vars {
        let cur = current.get(name.as_str()).and_then(|v| v.as_ref());
        if cur.map(|s| s.as_str()) != Some(desired.as_str()) {
            return Ok(true);
        }
    }

    // Check whether Path would change after applying add/remove.
    let cur_path = current
        .get("Path")
        .and_then(|v| v.as_ref())
        .map(|s| s.as_str());
    let new_path = update_path_value(
        cur_path,
        &plan.remove_path_entries,
        &plan.add_path_entries,
    );
    if cur_path.unwrap_or("") != new_path {
        return Ok(true);
    }

    Ok(false)
}

/// Check whether any of the environment values described by `plan` are
/// currently present in the registry (and therefore need removal).
pub async fn registry_needs_cleanup(
    plan: &EnvironmentCleanupPlan,
) -> AppResult<bool> {
    let keys: Vec<&str> = plan.env_vars.keys().map(|k| k.as_str()).collect();
    let mut names: Vec<&str> = keys.clone();
    names.push("Path");

    let current = read_machine_env_values(&names).await?;

    // If any env_var currently matches, cleanup is needed.
    for (name, value) in &plan.env_vars {
        let cur = current.get(name.as_str()).and_then(|v| v.as_ref());
        if cur.map(|s| s.as_str()) == Some(value.as_str()) {
            return Ok(true);
        }
    }

    // Check whether Path would change after removing entries.
    let cur_path = current
        .get("Path")
        .and_then(|v| v.as_ref())
        .map(|s| s.as_str());
    let new_path =
        update_path_value(cur_path, &plan.remove_path_entries, &[]);
    if cur_path.unwrap_or("") != new_path {
        return Ok(true);
    }

    Ok(false)
}

/// Apply an [`EnvironmentApplyPlan`] to the machine environment registry.
///
/// 1. Reads current values.
/// 2. Determines which values need writing (changed env_vars + updated Path).
/// 3. Creates a backup if any writes are needed.
/// 4. Writes all changed values.
/// 5. Updates the current process environment to match.
pub async fn apply_registry_plan(
    app_handle: &AppHandle,
    plan: &EnvironmentApplyPlan,
) -> AppResult<()> {
    let keys: Vec<&str> = plan.env_vars.keys().map(|k| k.as_str()).collect();
    let mut names: Vec<&str> = keys.clone();
    names.push("Path");

    let current = read_machine_env_values(&names).await?;

    // Build list of (name, Option<value>) writes to perform.
    let mut writes: Vec<(String, Option<String>)> = Vec::new();

    for (name, desired) in &plan.env_vars {
        let cur = current.get(name.as_str()).and_then(|v| v.as_ref());
        if cur.map(|s| s.as_str()) != Some(desired.as_str()) {
            writes.push((name.clone(), Some(desired.clone())));
        }
    }

    // Calculate new Path value.
    let cur_path = current
        .get("Path")
        .and_then(|v| v.as_ref())
        .map(|s| s.as_str());
    let new_path = update_path_value(
        cur_path,
        &plan.remove_path_entries,
        &plan.add_path_entries,
    );
    if cur_path.unwrap_or("") != new_path {
        writes.push(("Path".to_string(), Some(new_path.clone())));
    }

    if writes.is_empty() {
        return Ok(());
    }

    // Backup before mutating.
    backup_registry(app_handle).await?;

    // Execute all writes.
    for (name, value) in &writes {
        match value {
            Some(v) => {
                // Use REG_EXPAND_SZ when the value contains %VAR% references.
                let is_expand = v.contains('%');
                write_machine_env_value(name, v, is_expand).await?;
            }
            None => {
                delete_machine_env_value(name).await?;
            }
        }
    }

    // Synchronize the current process environment.
    // SAFETY: These calls occur within the registry update path on Windows.
    // The Windows API for environment variables is thread-safe, and no other
    // threads concurrently modify the process environment block.
    for (name, value) in &plan.env_vars {
        unsafe { std::env::set_var(name, value); }
    }

    // Update Path / PATH in the current process.
    let path_key =
        if std::env::var("Path").is_err() && std::env::var("PATH").is_ok() {
            "PATH"
        } else {
            "Path"
        };
    // SAFETY: See above — single-threaded environment update path on Windows.
    unsafe { std::env::set_var(path_key, &new_path); }

    Ok(())
}

/// Apply an [`EnvironmentCleanupPlan`] to the machine environment registry.
///
/// 1. Reads current values.
/// 2. Determines which env_vars match (and therefore need deletion).
/// 3. Calculates the new Path after removing entries.
/// 4. Creates a backup if any changes are needed.
/// 5. Deletes matching values and writes the updated Path.
/// 6. Cleans the current process environment.
pub async fn cleanup_registry_plan(
    app_handle: &AppHandle,
    plan: &EnvironmentCleanupPlan,
) -> AppResult<()> {
    let keys: Vec<&str> = plan.env_vars.keys().map(|k| k.as_str()).collect();
    let mut names: Vec<&str> = keys.clone();
    names.push("Path");

    let current = read_machine_env_values(&names).await?;

    // Determine which env_vars currently match and need deletion.
    let mut deletes: Vec<String> = Vec::new();
    for (name, value) in &plan.env_vars {
        let cur = current.get(name.as_str()).and_then(|v| v.as_ref());
        if cur.map(|s| s.as_str()) == Some(value.as_str()) {
            deletes.push(name.clone());
        }
    }

    // Calculate new Path after removing entries.
    let cur_path = current
        .get("Path")
        .and_then(|v| v.as_ref())
        .map(|s| s.as_str());
    let new_path =
        update_path_value(cur_path, &plan.remove_path_entries, &[]);
    let path_changed = cur_path.unwrap_or("") != new_path;

    if deletes.is_empty() && !path_changed {
        return Ok(());
    }

    // Backup before mutating.
    backup_registry(app_handle).await?;

    // Delete matching env vars.
    for name in &deletes {
        delete_machine_env_value(name).await?;
    }

    // Write updated Path if it changed.
    if path_changed {
        write_machine_env_value("Path", &new_path, new_path.contains('%'))
            .await?;
    }

    // Clean the current process environment.
    // SAFETY: These calls occur within the registry cleanup path on Windows.
    // The Windows API for environment variables is thread-safe, and no other
    // threads concurrently modify the process environment block.
    for name in &deletes {
        unsafe { std::env::remove_var(name); }
    }

    if path_changed {
        let path_key = if std::env::var("Path").is_err()
            && std::env::var("PATH").is_ok()
        {
            "PATH"
        } else {
            "Path"
        };
        // SAFETY: See above — single-threaded environment cleanup path on Windows.
        unsafe { std::env::set_var(path_key, &new_path); }
    }

    Ok(())
}

/// Synchronize the current process environment with the machine registry
/// values for the given variable `names`.
///
/// For each name the current registry value is read; if present it is set in
/// the process, if absent it is removed.  The `Path` / `PATH` variable is
/// handled specially to preserve the casing used by the process.
pub async fn synchronize_process_env(names: &[String]) -> AppResult<()> {
    let mut refs: Vec<&str> = names.iter().map(|s| s.as_str()).collect();
    refs.push("Path");

    let current = read_machine_env_values(&refs).await?;

    // SAFETY: These calls occur within the process-environment sync path on Windows.
    // The Windows API for environment variables is thread-safe, and no other
    // threads concurrently modify the process environment block.
    for name in names {
        match current.get(name.as_str()).and_then(|v| v.as_ref()) {
            Some(value) => {
                unsafe { std::env::set_var(name, value); }
            }
            None => {
                unsafe { std::env::remove_var(name); }
            }
        }
    }

    // Update Path / PATH in the current process.
    let new_path = current
        .get("Path")
        .and_then(|v| v.as_ref())
        .map(|s| s.as_str())
        .unwrap_or("");

    let path_key =
        if std::env::var("Path").is_err() && std::env::var("PATH").is_ok() {
            "PATH"
        } else {
            "Path"
        };
    // SAFETY: See above — single-threaded process-environment sync on Windows.
    unsafe { std::env::set_var(path_key, new_path); }

    Ok(())
}
