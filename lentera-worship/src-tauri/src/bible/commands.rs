// ===== Tauri commands =====
use super::*;
use std::{path::PathBuf, sync::Arc};
use tauri::{Manager, State};

fn dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join("bible"))
}

/// Installed translations (menggabungkan versi bawaan SQLite di cache + versi USFM di disk).
#[tauri::command]
pub fn bible_list(app: tauri::AppHandle, st: State<'_, BibleState>) -> Result<Vec<Info>, String> {
    let mut map: HashMap<String, Info> = HashMap::new();

    // 1. Ambil seluruh terjemahan yang dimuat dari alkitab.sqlite (dan cache aktif)
    if let Ok(cache) = st.cache.lock() {
        for (id, tr) in cache.iter() {
            map.insert(
                id.clone(),
                Info {
                    meta: tr.meta.clone(),
                    books: tr.books.len(),
                    book_ids: tr.books.iter().map(|b| b.id.clone()).collect(),
                },
            );
        }
    }

    // 2. Gabungkan dengan terjemahan hasil impor USFM yang tersimpan di disk
    for disk_info in list(&dir(&app)?) {
        map.entry(disk_info.meta.id.clone()).or_insert(disk_info);
    }

    let mut result: Vec<Info> = map.into_values().collect();
    result.sort_by(|a, b| a.meta.name.cmp(&b.meta.name));
    Ok(result)
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
    let info = Info { 
        meta: t.meta.clone(), 
        books: t.books.len(), 
        book_ids: t.books.iter().map(|b| b.id.clone()).collect(), 
    };
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
    let tmp = std::env::temp_dir().join(format!("lentera_{id}_{}.zip", std::process::id()));
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
    if ok {
        // Hanya hapus dari cache jika file-nya memang berasal dari disk (hasil impor USFM)
        st.cache.lock().map_err(|e| e.to_string())?.remove(&id);
    }
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