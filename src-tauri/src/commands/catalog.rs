use crate::state::AppState;
use crate::shared::types::*;

#[tauri::command]
pub async fn catalog_list_versions(
    state: tauri::State<'_, AppState>,
    query: VersionCatalogQuery,
) -> Result<Vec<AvailableVersion>, String> {
    let catalog = state.version_catalog.lock().await;
    catalog.list_versions(&query).await.map_err(|e| e.to_string())
}
