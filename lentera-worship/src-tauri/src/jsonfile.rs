use serde::{de::DeserializeOwned, Serialize};
use std::{fs, path::Path};

/// Baca JSON. File tidak ada -> None. File rusak -> diganti nama jadi `.bad`, lalu None.
pub fn load<T: DeserializeOwned>(dir: &Path, file: &str) -> Option<T> {
    let p = dir.join(file);
    let s = fs::read_to_string(&p).ok()?;
    match serde_json::from_str(&s) {
        Ok(v) => Some(v),
        Err(_) => {
            let _ = fs::rename(&p, dir.join(format!("{file}.bad")));
            None
        }
    }
}

/// Simpan atomik: tulis ke `.tmp` dulu, lalu rename.
pub fn save<T: Serialize>(dir: &Path, file: &str, value: &T) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join(file);
    let tmp = dir.join(format!("{file}.tmp"));
    fs::write(&tmp, serde_json::to_vec_pretty(value).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

pub fn remove(dir: &Path, file: &str) {
    let _ = fs::remove_file(dir.join(file));
}