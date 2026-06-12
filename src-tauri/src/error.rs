//! Application-wide error types and result alias.

use serde::Serialize;
use thiserror::Error;

/// Application error types covering IO, JSON, HTTP, and Tauri IPC failures.
#[derive(Debug, Error)]
pub enum AppError {
    /// Wraps a standard I/O error from file or network operations.
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// Wraps a JSON serialization or deserialization error.
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// Wraps an HTTP client error from reqwest.
    #[error("HTTP error: {0}")]
    Http(#[from] reqwest::Error),

    /// Wraps a Tauri framework error.
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    /// A custom error message for application-specific failures.
    #[error("{0}")]
    Message(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

impl From<String> for AppError {
    fn from(s: String) -> Self {
        AppError::Message(s)
    }
}

impl From<&str> for AppError {
    fn from(s: &str) -> Self {
        AppError::Message(s.to_string())
    }
}

/// Convenience result type using [`AppError`] as the default error.
pub type AppResult<T> = Result<T, AppError>;
