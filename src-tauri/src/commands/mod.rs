//! Tauri IPC command handlers invoked by the frontend.

pub mod config;
pub mod system;
pub mod dialog;
pub mod environments;
pub mod catalog;
pub mod task;

pub use config::*;
pub use system::*;
pub use dialog::*;
pub use environments::*;
pub use catalog::*;
pub use task::*;
