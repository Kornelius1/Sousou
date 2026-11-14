use crate::session_pack::{self, ExportRequest};
use crate::groups::{self, Store};
use crate::{background::Background, jsonfile};
use std::path::PathBuf;
use tauri::Manager;

#[tauri::command]
pub fn load_groups(app: tauri::AppHandle) -> Result<Option<Store>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(groups::load(&dir, "groups.json"))
}

#[tauri::command]
pub fn save_groups(app: tauri::AppHandle, store: Store) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    groups::save(&dir, "groups.json", &store)
}

#[tauri::command]
pub async fn export_session(req: ExportRequest) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || session_pack::export_session(req))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_session(app: tauri::AppHandle, pack: PathBuf) -> Result<serde_json::Value, String> {
    let data = app.path().app_data_dir().map_err(|e| e.to_string())?;
    tauri::async_runtime::spawn_blocking(move || session_pack::import_session(&pack, &data))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn load_background_state(app: tauri::AppHandle) -> Result<Option<Background>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(jsonfile::load::<Background>(&dir, "background.json").and_then(Background::sanitize))
}

#[tauri::command]
pub fn save_background_state(
    app: tauri::AppHandle,
    state: Option<Background>,
) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    match state.and_then(Background::sanitize) {
        Some(bg) => jsonfile::save(&dir, "background.json", &bg),
        None => {
            jsonfile::remove(&dir, "background.json");
            Ok(())
        }
    }
}