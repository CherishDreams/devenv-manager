use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn dialog_select_directory(app: AppHandle) -> Result<Option<String>, String> {
    let result = app.dialog().file().blocking_pick_folder();
    Ok(result.map(|path| path.to_string()))
}
