use std::{path::PathBuf, sync::OnceLock};
use tauri::{AppHandle, Manager};

struct Launch {
    file: Option<String>,
    dir: Option<PathBuf>, // Some = sesi terisolasi (sementara)
}

fn launch() -> &'static Launch {
    static L: OnceLock<Launch> = OnceLock::new();
    L.get_or_init(|| {
        let args: Vec<String> = std::env::args().skip(1).collect();
        let file = args
            .iter()
            .find(|a| a.to_lowercase().ends_with(".lentera"))
            .cloned();
        let fresh = args.iter().any(|a| a == "--new-session");
        let dir = (file.is_some() || fresh).then(|| {
            std::env::temp_dir()
                .join("lentera-worship")
                .join(format!("win-{}", std::process::id()))
        });
        Launch { file, dir }
    })
}

pub fn is_isolated() -> bool {
    launch().dir.is_some()
}

/// Folder data untuk library, groups, background. Setting & tema tetap pakai app_data_dir biasa.
pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    match &launch().dir {
        Some(d) => {
            std::fs::create_dir_all(d).map_err(|e| e.to_string())?;
            Ok(d.clone())
        }
        None => app.path().app_data_dir().map_err(|e| e.to_string()),
    }
}

pub fn launch_file() -> Option<String> {
    launch().file.clone()
}

pub fn cleanup() {
    if let Some(d) = &launch().dir {
        let _ = std::fs::remove_dir_all(d);
    }
}