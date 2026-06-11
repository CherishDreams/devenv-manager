use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn dialog_select_directory(app: AppHandle) -> Result<Option<String>, String> {
    let result = tauri::async_runtime::spawn_blocking(move || {
        app.dialog().file().blocking_pick_folder()
    })
    .await
    .map_err(|e| e.to_string())?;
    Ok(result.map(|path| path.to_string()))
}
