// ===== Tauri commands =====
use super::*;
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, State};

fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("bible"))
}

/// Installed translations (metadata only).
#[tauri::command]
pub fn bible_list(app: tauri::AppHandle) -> Result<Vec<Info>, String> {
    Ok(list(&dir(&app)?))
}

/// Jalur bersama untuk impor manual dan unduhan.
async fn install(
    app: &tauri::AppHandle,
    st: &State<'_, BibleState>,
    path: PathBuf,
    meta: Meta,
) -> Result<Info, String> {
    let d = dir(app)?;
    let t = tauri::async_runtime::spawn_blocking(move || {
        let t = import_zip(&path, &meta)?;
        save(&d, &t)?;
        Ok::<Translation, String>(t)
    })
    .await
    .map_err(|e| e.to_string())??;
    let info = Info { meta: t.meta.clone(), books: t.books.len() };
    st.cache.lock().map_err(|e| e.to_string())?.insert(t.meta.id.clone(), Arc::new(t));
    Ok(info)
}

/// Import a translation from a USFM zip chosen by the user.
#[tauri::command]
pub async fn bible_import_usfm(
    app: tauri::AppHandle,
    st: State<'_, BibleState>,
    path: String,
    meta: Meta,
) -> Result<Info, String> {
    install(&app, &st, PathBuf::from(path), meta).await
}

/// Download a catalog translation and install it.
#[tauri::command]
pub async fn bible_download_usfm(
    app: tauri::AppHandle,
    st: State<'_, BibleState>,
    id: String,
    meta: Meta,
) -> Result<Info, String> {
    if meta.id != id {
        return Err("Data terjemahan tidak cocok".into());
    }
    let url = super::download::source_url(&id).ok_or("Terjemahan tidak dikenal")?;
    let tmp = std::env::temp_dir().join(format!("presentcraft_{id}_{}.zip", std::process::id()));
    let result = async {
        super::download::fetch_zip(url, &tmp).await?;
        install(&app, &st, tmp.clone(), meta).await
    }
    .await;
    let _ = std::fs::remove_file(&tmp); // dihapus, sukses atau gagal
    result
}

#[tauri::command]
pub fn bible_remove(app: tauri::AppHandle, st: State<'_, BibleState>, id: String) -> Result<bool, String> {
    let ok = remove(&dir(&app)?, &id)?;
    st.cache.lock().map_err(|e| e.to_string())?.remove(&id);
    Ok(ok)
}

/// Look up a reference such as "Yoh 3:16-18" in an installed translation.
#[tauri::command]
pub fn bible_passage(
    app: tauri::AppHandle,
    st: State<'_, BibleState>,
    id: String,
    reference: String,
) -> Result<Passage, String> {
    let t = load(&dir(&app)?, &st, &id)?;
    passage(&t, &parse_ref(&reference)?)
}

/// Keyword search (all words must appear).
#[tauri::command]
pub fn bible_search(
    app: tauri::AppHandle,
    st: State<'_, BibleState>,
    id: String,
    query: String,
    limit: Option<usize>,
) -> Result<Vec<Hit>, String> {
    let t = load(&dir(&app)?, &st, &id)?;
    Ok(search(&t, &query, limit.unwrap_or(50).min(200)))
}