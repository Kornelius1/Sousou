use std::fs::{self, File};
use std::io::{self, BufReader};
use std::path::Path;

mod pro_parser;
mod commands;
mod groups;
mod store_ops;
mod session_pack;
mod ndi;
mod camera;
mod jsonfile;
mod background;
mod lib_commands;
mod bible;
mod data_dir;
// mod lyrics;
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

    let cache_dir = data_dir::data_dir(&app)?
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

#[tauri::command]
fn toggle_audience(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri::{LogicalSize, Manager};
    let e = |x: tauri::Error| x.to_string();
    let win = app
        .get_webview_window("audience")
        .ok_or("window audience tidak ditemukan")?;

    // sedang tampil -> sembunyikan
    if win.is_visible().map_err(e)? {
        let _ = win.set_fullscreen(false);
        win.hide().map_err(e)?;
        return Ok(false);
    }

    // cari monitor yang BUKAN tempat window utama berada
    let main_mon = app
        .get_webview_window("main")
        .and_then(|m| m.current_monitor().ok().flatten());
    let monitors = win.available_monitors().map_err(e)?;
    let external = monitors.iter().find(|m| match &main_mon {
        Some(mm) => m.position() != mm.position(),
        None => false,
    });

    win.show().map_err(e)?;
    if let Some(m) = external {
        // proyektor / layar kedua: pindah ke sana lalu fullscreen
        win.set_position(*m.position()).map_err(e)?;
        win.set_fullscreen(true).map_err(e)?;
    } else {
        // satu monitor: window biasa agar bisa dites tanpa proyektor
        win.set_fullscreen(false).map_err(e)?;
        win.set_size(LogicalSize::new(960.0, 540.0)).map_err(e)?;
        win.center().map_err(e)?;
    }
    Ok(external.is_some())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(camera::CameraHub::default())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            use tauri::Manager;

            let bible_state = bible::BibleState::default();
            if let Ok(sqlite_path) = app
                .path()
                .resolve("resources/alkitab.sqlite", tauri::path::BaseDirectory::Resource)
            {
                if let Err(e) = bible_state.load_sqlite(&sqlite_path) {
                    eprintln!("Peringatan load SQLite Alkitab: {}", e);
                }
            }
            app.manage(bible_state);

            // folder data: terisolasi (temp) untuk window baru, app_data_dir untuk window utama
            let dir = data_dir::data_dir(app.handle())?;
            app.manage(lib_commands::LibState::load(&dir));

            camera::start_server(app.state::<camera::CameraHub>().inner().clone())?;

            let audience = tauri::WebviewWindowBuilder::new(
                app,
                "audience",
                tauri::WebviewUrl::App("audience.html".into()),
            )
            .title("Lentera Worship - Audience Display")
            .inner_size(1280.0, 720.0)
            .visible(false)
            .build()?;

            // klik X pada window audience hanya menyembunyikan, tidak menghancurkannya
            let a = audience.clone();
            audience.on_window_event(move |ev| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = ev {
                    api.prevent_close();
                    let _ = a.set_fullscreen(false);
                    let _ = a.hide();
                }
            });

            // keluar hanya setelah window utama benar-benar dihancurkan
            // (JS menunda penutupan lewat onCloseRequested untuk dialog simpan)
            if let Some(main) = app.get_webview_window("main") {
                let h = app.handle().clone();
                main.on_window_event(move |ev| {
                    if let tauri::WindowEvent::Destroyed = ev {
                        h.exit(0);
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            toggle_audience,
            load_presentation_bundle,
            commands::export_session,
            commands::import_session,
            commands::load_background_state,
            commands::save_background_state,
            commands::load_groups,
            commands::save_groups,
            commands::new_window,
            commands::launch_file,
            commands::is_isolated,
            ndi::ndi_discover,
            ndi::ndi_status,
            ndi::ndi_open_download,
            ndi::ndi_preview_start,
            ndi::ndi_preview_stop,
            camera::cam_list,
            camera::cam_start,
            camera::cam_stop,
            lib_commands::library_get,
            lib_commands::library_create_group,
            lib_commands::library_rename_group,
            lib_commands::library_delete_group,
            lib_commands::library_ensure_group,
            lib_commands::library_add_files,
            lib_commands::library_add_input,
            lib_commands::library_add_blank,
            lib_commands::library_replace_slides,
            lib_commands::library_set_tag,
            lib_commands::library_copy_in_many,
            lib_commands::library_remove_item,
            lib_commands::library_move_item,
            lib_commands::library_sort_group,
            lib_commands::library_update_item,
            bible::commands::bible_list,
            bible::commands::bible_passage,
            bible::commands::bible_search,
            bible::commands::bible_import_usfm,
            bible::commands::bible_download_usfm,
            bible::commands::bible_remove,
            // lyrics::lyrics_status,
            // lyrics::lyrics_set_key,
            // lyrics::lyrics_test,
            // lyrics::lyrics_search,
            // lyrics::lyrics_get,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let tauri::RunEvent::Exit = event {
                data_dir::cleanup();
            }
        });
}