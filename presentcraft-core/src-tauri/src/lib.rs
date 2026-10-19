use std::fs::{self, File};
use std::io::{self, BufReader};
use std::path::Path;
use tauri::Manager;

mod pro_parser;
mod commands;
mod groups;
mod session_pack;
use pro_parser::{parse_pro_file, parse_pro_file_with, MediaResolver, Slide};

#[derive(serde::Serialize)]
struct LoadResult {
    slides: Vec<Slide>,
    warnings: Vec<String>,
}

fn extract_probundle(bundle_path: &str, output_dir: &str) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::open(bundle_path)?;
    let reader = BufReader::new(file);
    let mut archive = zip::ZipArchive::new(reader)?;
    fs::create_dir_all(output_dir)?;

    for i in 0..archive.len() {
        let mut file_in_zip = archive.by_index(i)?;
        let outpath = match file_in_zip.enclosed_name() {
            Some(path) => Path::new(output_dir).join(path),
            None => continue,
        };
        if file_in_zip.name().ends_with('/') {
            fs::create_dir_all(&outpath)?;
        } else {
            if let Some(p) = outpath.parent() { if !p.exists() { fs::create_dir_all(p)?; } }
            let mut outfile = File::create(&outpath)?;
            io::copy(&mut file_in_zip, &mut outfile)?;
        }
    }
    Ok(())
}

fn collect_pro_files(dir: &Path, out: &mut Vec<std::path::PathBuf>) {
    if let Ok(rd) = fs::read_dir(dir) {
        for e in rd.flatten() {
            let p = e.path();
            if p.is_dir() {
                collect_pro_files(&p, out);
            } else if p.extension().and_then(|s| s.to_str())
                .map(|s| s.eq_ignore_ascii_case("pro")).unwrap_or(false)
            {
                out.push(p);
            }
        }
    }
}

#[tauri::command]
fn load_presentation_bundle(app: tauri::AppHandle, file_path: String) -> Result<LoadResult, String> {
    // File .pro tunggal: langsung diparse
    if file_path.to_lowercase().ends_with(".pro") {
        let p = Path::new(&file_path);
        return parse_pro_file(p, p.parent().unwrap_or(p))
            .map(|r| LoadResult { slides: r.slides, warnings: r.warnings });
    }

    //bundle
    let stem = Path::new(&file_path)
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_else(|| "bundle".into());
    let safe: String = stem
        .chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect();

    let cache_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("bundles")
        .join(safe);

    let _ = fs::remove_dir_all(&cache_dir); // hanya bundel yang sama

    extract_probundle(&file_path, cache_dir.to_str().ok_or("path cache tidak valid")?)
        .map_err(|e| format!("Gagal mengekstrak bundel: {}", e))?;

    let mut files = Vec::new();
    collect_pro_files(&cache_dir, &mut files);
    files.sort();

    let resolver = MediaResolver::new(&cache_dir);

    let mut all = Vec::new();
    let mut warnings = Vec::new();
    for f in files {
        let name = f.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
        match parse_pro_file_with(&f, &resolver) {
            Ok(mut r) => {
                warnings.extend(r.warnings.into_iter().map(|w| format!("{name}: {w}")));
                all.append(&mut r.slides);
            }
            Err(e) => warnings.push(format!("{name}: dilewati ({e})")),
        }
    }
    for (i, s) in all.iter_mut().enumerate() {
        s.slide_number = i + 1;
    }

    if all.is_empty() {
        return Err("Tidak ada slide .pro valid yang ditemukan.".to_string());
    }
    Ok(LoadResult { slides: all, warnings })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let _audience_window = tauri::WebviewWindowBuilder::new(
                app,
                "audience",
                tauri::WebviewUrl::App("audience.html".into())
            )
            .title("PresentCraft - Audience Display")
            .inner_size(1280.0, 720.0)
            .build()?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_presentation_bundle,
            commands::export_session,
            commands::import_session,
            commands::load_background_state,
            commands::save_background_state,
            commands::load_groups,
            commands::save_groups,
            commands::load_library,
            commands::save_library,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}