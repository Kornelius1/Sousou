use crate::session_pack::{self, ExportRequest, ImportedSession, Background};
use crate::groups::{self, Store};
use std::path::PathBuf;
use tauri::Manager;
use std::fs;

#[tauri::command]
pub fn load_groups(app: tauri::AppHandle) -> Result<Option<Store>, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(groups::load(&dir))
}

#[tauri::command]
pub fn save_groups(app: tauri::AppHandle, store: Store) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    groups::save(&dir, &store)
}

#[tauri::command]
pub async fn export_session(req: ExportRequest) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || session_pack::export_session(req))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn import_session(app: tauri::AppHandle, pack: PathBuf) -> Result<ImportedSession, String> {
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
pub fn load_background_state(app: tauri::AppHandle) -> Result<Option<Background>, String> {
    let p = bg_path(&app)?;
    let Ok(s) = fs::read_to_string(&p) else { return Ok(None) };
    // file rusak atau format lama: anggap tidak ada background
    Ok(serde_json::from_str(&s).ok())
}

#[tauri::command]
pub fn save_background_state(app: tauri::AppHandle, state: Option<Background>) -> Result<(), String> {
    let p = bg_path(&app)?;
    match state {
        None => {
            let _ = fs::remove_file(&p);
        }
        Some(bg) => {
            // tulis ke file sementara lalu rename, supaya crash tidak merusak file
            let tmp = p.with_extension("json.tmp");
            fs::write(&tmp, serde_json::to_vec_pretty(&bg).map_err(|e| e.to_string())?)
                .map_err(|e| e.to_string())?;
            fs::rename(&tmp, &p).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}