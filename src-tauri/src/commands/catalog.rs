use tauri::State;
use crate::error::AppResult;
use crate::state::AppState;
use crate::shared::types::*;

/// Lists available versions matching the given catalog query.
#[tauri::command]
pub async fn catalog_list_versions(
    state: State<'_, AppState>,
    query: VersionCatalogQuery,
) -> AppResult<Vec<AvailableVersion>> {
    let catalog = state.version_catalog.lock().await;
    catalog.list_versions(&query).await
}
