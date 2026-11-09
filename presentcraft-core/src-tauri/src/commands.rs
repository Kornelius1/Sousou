use crate::session_pack::{self, ExportRequest};
use crate::groups::{self, Store};
use std::path::PathBuf;
use tauri::Manager;
use std::fs;

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
pub fn load_library(app: tauri::AppHandle) -> Result<Option<Store>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(groups::load(&dir, "library.json"))
}

#[tauri::command]
pub fn save_library(app: tauri::AppHandle, store: Store) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    groups::save(&dir, "library.json", &store)
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

fn bg_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("background.json"))
}


#[tauri::command]
pub fn load_background_state(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let p = bg_path(&app)?;
    let Ok(s) = fs::read_to_string(&p) else { return Ok(None) };
    Ok(serde_json::from_str(&s).ok())
}

#[tauri::command]
pub fn save_background_state(
    app: tauri::AppHandle,
    state: Option<serde_json::Value>,
) -> Result<(), String> {
    let p = bg_path(&app)?;
    match state {
        None => {
            let _ = fs::remove_file(&p);
        }
        Some(bg) => {
            let tmp = p.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec_pretty(&bg).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn mixer_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("mixer.json"))
}

#[tauri::command]
pub fn load_mixer_state(app: tauri::AppHandle) -> Result<Option<serde_json::Value>, String> {
    let p = mixer_path(&app)?;
    let Ok(s) = fs::read_to_string(&p) else { return Ok(None) };
    Ok(serde_json::from_str(&s).ok())
}

#[tauri::command]
pub fn save_mixer_state(app: tauri::AppHandle, state: serde_json::Value) -> Result<(), String> {
    let p = mixer_path(&app)?;
    let tmp = p.with_extension("json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(&state).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}