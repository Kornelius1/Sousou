use serde::Serialize;
use std::path::PathBuf;

const DLL: &str = "Processing.NDI.Lib.x64.dll";

#[derive(Serialize)]
pub struct NdiSource {
    name: String,
}

#[derive(Serialize)]
pub struct NdiStatus {
    enabled: bool,   // build ini dikompilasi dengan fitur ndi
    installed: bool, // DLL NDI ditemukan (dibundel atau runtime sistem)
}

#[cfg(windows)]
fn registry_env(name: &str) -> Option<String> {
    use winreg::{enums::*, RegKey};
    let sys = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey(r"SYSTEM\CurrentControlSet\Control\Session Manager\Environment")
        .ok()
        .and_then(|k| k.get_value::<String, _>(name).ok());
    sys.or_else(|| {
        RegKey::predef(HKEY_CURRENT_USER)
            .open_subkey("Environment")
            .ok()
            .and_then(|k| k.get_value::<String, _>(name).ok())
    })
}

#[cfg(not(windows))]
fn registry_env(_: &str) -> Option<String> {
    None
}

fn exe_dir() -> Option<PathBuf> {
    std::env::current_exe().ok()?.parent().map(|d| d.to_path_buf())
}

/// DLL yang dibundel: harus berada di folder yang sama dengan .exe.
fn bundled_dir() -> Option<PathBuf> {
    let dir = exe_dir()?;
    dir.join(DLL).is_file().then_some(dir)
}

/// Runtime NDI terpasang di sistem (cadangan, berguna di mesin pengembangan).
fn system_dir() -> Option<PathBuf> {
    let raw = std::env::var("NDI_RUNTIME_DIR_V6")
        .ok()
        .or_else(|| registry_env("NDI_RUNTIME_DIR_V6"))?;
    let dir = PathBuf::from(raw);
    dir.join(DLL).is_file().then_some(dir)
}

/// Prioritas: DLL bundel dulu, lalu runtime sistem.
fn runtime_dir() -> Option<PathBuf> {
    bundled_dir().or_else(system_dir)
}

/// Hanya untuk runtime sistem: tambahkan foldernya ke PATH satu kali saja.
/// DLL bundel tidak perlu ini karena folder .exe sudah masuk jalur pencarian DLL.
#[cfg(feature = "ndi")]
fn prepare_dll_path(dir: &std::path::Path) {
    use std::sync::Once;
    static ONCE: Once = Once::new();
    ONCE.call_once(|| {
        if exe_dir().as_deref() == Some(dir) {
            return;
        }
        let old = std::env::var("PATH").unwrap_or_default();
        unsafe { std::env::set_var("PATH", format!("{};{old}", dir.display())) };
    });
}

#[tauri::command]
pub fn ndi_status() -> NdiStatus {
    NdiStatus {
        enabled: cfg!(feature = "ndi"),
        installed: runtime_dir().is_some(),
    }
}

/// Membuka halaman resmi NDI. URL dikunci di sini: frontend tidak bisa
/// menyuruh Rust membuka alamat sembarang. Tautan ini juga memenuhi
/// kewajiban menampilkan link ndi.video di dekat pengaturan NDI.
#[tauri::command]
pub fn ndi_open_download() -> Result<(), String> {
    std::process::Command::new("cmd")
        .args(["/C", "start", "", "https://ndi.video/"])
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_discover() -> Result<Vec<NdiSource>, String> {
    use grafton_ndi::{Finder, FinderOptions, NDI};
    use std::time::Duration;

    let dir = runtime_dir().ok_or("NDI_RUNTIME_MISSING")?;
    tauri::async_runtime::spawn_blocking(move || {
        prepare_dll_path(&dir);

        let ndi = NDI::new().map_err(|e| e.to_string())?;
        let opts = FinderOptions::builder().show_local_sources(true).build();
        let finder = Finder::new(&ndi, &opts).map_err(|e| e.to_string())?;
        finder
            .wait_for_sources(Duration::from_millis(2000))
            .map_err(|e| e.to_string())?;
        let sources = finder
            .sources(Duration::from_millis(500))
            .map_err(|e| e.to_string())?;
        Ok(sources.into_iter().map(|s| NdiSource { name: s.name }).collect())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_discover() -> Result<Vec<NdiSource>, String> {
    Err("NDI_DISABLED".into())
}