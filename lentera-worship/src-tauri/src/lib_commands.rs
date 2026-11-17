use crate::groups::{self, Group, Item, Store};
use crate::store_ops::Outcome;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::{path::Path, sync::Mutex};
use tauri::{Manager, State};

const FILE: &str = "library.json";

/// Pemilik data library selama aplikasi berjalan.
pub struct LibState(pub Mutex<Store>);

impl LibState {
    pub fn load(dir: &Path) -> Self {
        Self(Mutex::new(groups::load(dir, FILE).unwrap_or_default()))
    }
}

/// Hasil operasi + salinan terbaru seluruh store (untuk mirror di JS).
#[derive(Serialize)]
pub struct Reply<T: Serialize> {
    result: T,
    store: Store,
}

#[derive(Deserialize)]
pub struct TagArg {
    name: String,
    color: String,
}

/// Kunci store, jalankan perubahan, simpan ke disk, kembalikan hasil + store.
fn mutate<T: Serialize>(
    app: &tauri::AppHandle,
    st: &State<'_, LibState>,
    f: impl FnOnce(&mut Store) -> T,
) -> Result<Reply<T>, String> {
    let mut s = st.0.lock().map_err(|e| e.to_string())?;
    let result = f(&mut s);
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    groups::save(&dir, FILE, &s)?;
    Ok(Reply { result, store: s.clone() })
}

#[tauri::command]
pub fn library_get(st: State<'_, LibState>) -> Result<Store, String> {
    Ok(st.0.lock().map_err(|e| e.to_string())?.clone())
}

#[tauri::command]
pub fn library_create_group(app: tauri::AppHandle, st: State<'_, LibState>, name: String) -> Result<Reply<Group>, String> {
    mutate(&app, &st, |s| s.create_group(&name))
}

#[tauri::command]
pub fn library_rename_group(app: tauri::AppHandle, st: State<'_, LibState>, id: String, name: String) -> Result<Reply<bool>, String> {
    mutate(&app, &st, |s| s.rename_group(&id, &name))
}

#[tauri::command]
pub fn library_delete_group(app: tauri::AppHandle, st: State<'_, LibState>, id: String) -> Result<Reply<bool>, String> {
    mutate(&app, &st, |s| s.delete_group(&id))
}

#[tauri::command]
pub fn library_ensure_group(app: tauri::AppHandle, st: State<'_, LibState>, name: String) -> Result<Reply<String>, String> {
    mutate(&app, &st, |s| s.ensure_group(&name).0)
}

#[tauri::command]
pub fn library_add_files(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, paths: Vec<String>) -> Result<Reply<usize>, String> {
    mutate(&app, &st, |s| s.add_files(&gid, &paths, true))
}

#[tauri::command]
pub fn library_add_input(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, cfg: Value) -> Result<Reply<Option<Item>>, String> {
    mutate(&app, &st, |s| s.add_input(&gid, cfg))
}

#[tauri::command]
pub fn library_add_blank(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, name: String) -> Result<Reply<Option<Item>>, String> {
    mutate(&app, &st, |s| s.add_blank(&gid, &name))
}

#[tauri::command]
pub fn library_replace_slides(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, origin: String, slides: Vec<Map<String, Value>>) -> Result<Reply<usize>, String> {
    mutate(&app, &st, |s| s.replace_slides(&gid, &origin, slides))
}

#[tauri::command]
pub fn library_set_tag(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, iid: String, tag: Option<TagArg>) -> Result<Reply<bool>, String> {
    mutate(&app, &st, |s| s.set_tag(&gid, &iid, tag.map(|t| (t.name, t.color))))
}

/// Salin banyak item sekaligus (menggantikan loop `copyIn` di session.js dan library.js).
#[tauri::command]
pub fn library_copy_in_many(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, items: Vec<Map<String, Value>>) -> Result<Reply<Value>, String> {
    mutate(&app, &st, |s| {
        let (mut ok, mut dup) = (0, 0);
        for it in &items {
            match s.copy_in(&gid, it).0 {
                Outcome::Ok => ok += 1,
                Outcome::Dup => dup += 1,
                Outcome::NotFound => {}
            }
        }
        json!({ "ok": ok, "dup": dup })
    })
}

#[tauri::command]
pub fn library_remove_item(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, iid: String) -> Result<Reply<bool>, String> {
    mutate(&app, &st, |s| s.remove_item(&gid, &iid))
}

#[tauri::command]
pub fn library_move_item(app: tauri::AppHandle, st: State<'_, LibState>, from: String, iid: String, to: String) -> Result<Reply<Outcome>, String> {
    mutate(&app, &st, |s| s.move_item(&from, &iid, &to))
}

#[tauri::command]
pub fn library_sort_group(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, by: String, dir: String) -> Result<Reply<bool>, String> {
    mutate(&app, &st, |s| s.sort_group(&gid, &by, dir == "desc"))
}

/// Sering dipanggil (geser layer), jadi hanya mengembalikan item yang berubah, bukan seluruh store.
#[tauri::command]
pub fn library_update_item(app: tauri::AppHandle, st: State<'_, LibState>, gid: String, iid: String, patch: Map<String, Value>) -> Result<Option<Item>, String> {
    let mut s = st.0.lock().map_err(|e| e.to_string())?;
    if !s.update_item(&gid, &iid, &patch) {
        return Ok(None);
    }
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    groups::save(&dir, FILE, &s)?;
    Ok(s.groups.iter().find(|g| g.id == gid).and_then(|g| g.items.iter().find(|x| x.id == iid)).cloned())
}