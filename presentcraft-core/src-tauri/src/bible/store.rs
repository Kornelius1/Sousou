use super::*;
use std::{fs, path::Path, sync::Arc};

pub(super) fn safe_id(id: &str) -> Result<String, String> {
    let ok = !id.is_empty()
        && id.len() <= 40
        && id.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-');
    if ok {
        Ok(id.to_string())
    } else {
        Err("Invalid translation id.".into())
    }
}

pub fn save(dir: &Path, t: &Translation) -> Result<(), String> {
    let id = safe_id(&t.meta.id)?;
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{id}.json.tmp"));
    fs::write(&tmp, serde_json::to_vec(t).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    fs::rename(&tmp, dir.join(format!("{id}.json"))).map_err(|e| e.to_string())?;
    let info = Info { meta: t.meta.clone(), books: t.books.len() };
    fs::write(
        dir.join(format!("{id}.meta.json")),
        serde_json::to_vec(&info).map_err(|e| e.to_string())?,
    )
    .map_err(|e| e.to_string())
}

pub fn list(dir: &Path) -> Vec<Info> {
    let mut out: Vec<Info> = fs::read_dir(dir)
        .into_iter()
        .flatten()
        .flatten()
        .filter(|e| e.file_name().to_string_lossy().ends_with(".meta.json"))
        .filter_map(|e| fs::read(e.path()).ok())
        .filter_map(|b| serde_json::from_slice(&b).ok())
        .collect();
    out.sort_by(|a, b| a.meta.name.to_lowercase().cmp(&b.meta.name.to_lowercase()));
    out
}

pub fn remove(dir: &Path, id: &str) -> Result<bool, String> {
    let id = safe_id(id)?;
    let a = fs::remove_file(dir.join(format!("{id}.json"))).is_ok();
    let _ = fs::remove_file(dir.join(format!("{id}.meta.json")));
    Ok(a)
}

pub fn load(dir: &Path, st: &BibleState, id: &str) -> Result<Arc<Translation>, String> {
    let id = safe_id(id)?;
    if let Some(t) = st.cache.lock().map_err(|e| e.to_string())?.get(&id) {
        return Ok(t.clone());
    }
    let bytes = fs::read(dir.join(format!("{id}.json"))).map_err(|_| "Translation is not installed.".to_string())?;
    let t: Arc<Translation> = Arc::new(serde_json::from_slice(&bytes).map_err(|e| e.to_string())?);
    st.cache.lock().map_err(|e| e.to_string())?.insert(id, t.clone());
    Ok(t)
}
