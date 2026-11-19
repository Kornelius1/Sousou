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

// ---------------------------------------------------------------------------
// Discovery: finder hidup terus di thread latar, daftar diperbarui otomatis.
// ---------------------------------------------------------------------------

#[cfg(feature = "ndi")]
mod worker {
    use super::{prepare_dll_path, NdiSource};
    use grafton_ndi::{Finder, FinderOptions, NDI};
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::{Mutex, Once};
    use std::time::{Duration, Instant};
    use tauri::Emitter;

    /// Nama event yang dikirim ke frontend saat daftar sumber berubah.
    pub const EVENT: &str = "ndi-sources-changed";

    struct Shared {
        sources: Mutex<Vec<String>>,
        error: Mutex<Option<String>>,
        /// true setelah siklus discovery pertama selesai (berhasil atau gagal).
        ready: AtomicBool,
    }

    static SHARED: Shared = Shared {
        sources: Mutex::new(Vec::new()),
        error: Mutex::new(None),
        ready: AtomicBool::new(false),
    };
    static START: Once = Once::new();

    /// Jalankan thread latar satu kali saja; panggilan berikutnya tidak melakukan apa-apa.
    pub fn start(app: tauri::AppHandle, dir: PathBuf) {
        START.call_once(|| {
            std::thread::Builder::new()
                .name("ndi-finder".into())
                .spawn(move || run(app, dir))
                .expect("gagal membuat thread NDI");
        });
    }

    fn run(app: tauri::AppHandle, dir: PathBuf) {
        prepare_dll_path(&dir);

        let fail = |e: String| {
            *SHARED.error.lock().unwrap() = Some(e);
            SHARED.ready.store(true, Ordering::Release);
        };

        // `ndi` harus hidup lebih lama dari `finder` (finder meminjamnya).
        let ndi = match NDI::new() {
            Ok(n) => n,
            Err(e) => return fail(e.to_string()),
        };
        let opts = FinderOptions::builder().show_local_sources(true).build();
        let finder = match Finder::new(&ndi, &opts) {
            Ok(f) => f,
            Err(e) => return fail(e.to_string()),
        };

        let mut last: Vec<String> = Vec::new();
        loop {
            let _ = finder.wait_for_sources(Duration::from_millis(1000));

            let list = match finder.sources(Duration::from_millis(0)) {
                Ok(l) => l,
                Err(_) => {
                    std::thread::sleep(Duration::from_millis(500));
                    continue;
                }
            };

            let mut names: Vec<String> = list.into_iter().map(|s| s.name).collect();
            names.sort();

            if names != last {
                *SHARED.sources.lock().unwrap() = names.clone();
                let _ = app.emit(EVENT, names.clone());
                last = names;
            }
            SHARED.ready.store(true, Ordering::Release);
        }
    }

    /// Tunggu siklus pertama selesai (maks. `timeout`), lalu kembalikan daftar saat ini.
    pub fn snapshot(timeout: Duration) -> Result<Vec<NdiSource>, String> {
        let start = Instant::now();
        while !SHARED.ready.load(Ordering::Acquire) && start.elapsed() < timeout {
            std::thread::sleep(Duration::from_millis(50));
        }
        if let Some(e) = SHARED.error.lock().unwrap().clone() {
            return Err(e);
        }
        let names = SHARED.sources.lock().unwrap().clone();
        Ok(names.into_iter().map(|name| NdiSource { name }).collect())
    }
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_discover(app: tauri::AppHandle) -> Result<Vec<NdiSource>, String> {
    use std::time::Duration;

    let dir = runtime_dir().ok_or("NDI_RUNTIME_MISSING")?;
    worker::start(app, dir);
    tauri::async_runtime::spawn_blocking(|| worker::snapshot(Duration::from_secs(5)))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_discover() -> Result<Vec<NdiSource>, String> {
    Err("NDI_DISABLED".into())
}


// ---------------------------------------------------------------------------
// Preview: satu stream per (jendela, slot). Frame dikirim sebagai JPEG mentah.
// ---------------------------------------------------------------------------

#[cfg(feature = "ndi")]
mod preview {
    use super::{prepare_dll_path, runtime_dir};
    use grafton_ndi::{Finder, FinderOptions, Receiver, ReceiverOptions, NDI};
    use std::collections::HashMap;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::{LazyLock, Mutex};
    use std::time::{Duration, Instant};
    use tauri::ipc::{Channel, InvokeResponseBody};

    static COUNTER: AtomicU64 = AtomicU64::new(0);
    static GENS: LazyLock<Mutex<HashMap<String, u64>>> = LazyLock::new(Default::default);

    fn is_current(key: &str, g: u64) -> bool {
        GENS.lock().unwrap().get(key) == Some(&g)
    }

    /// Hapus entri hanya bila masih milik generasi ini (jangan hapus stream yang lebih baru).
    fn release(key: &str, g: u64) {
        let mut m = GENS.lock().unwrap();
        if m.get(key) == Some(&g) {
            m.remove(key);
        }
    }

    pub fn stop(key: &str) {
        GENS.lock().unwrap().remove(key);
    }

    pub fn start(
        key: String,
        name: String,
        max_w: usize,
        on_frame: Channel<InvokeResponseBody>,
    ) -> Result<(), String> {
        let dir = runtime_dir().ok_or("NDI_RUNTIME_MISSING")?;
        let my_gen = COUNTER.fetch_add(1, Ordering::SeqCst) + 1;
        GENS.lock().unwrap().insert(key.clone(), my_gen);
        let min_gap = Duration::from_millis(if max_w > 480 { 33 } else { 66 });
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();

        let thread_key = key.clone();
        std::thread::Builder::new()
            .name("ndi-preview".into())
            .spawn(move || {
                let key = thread_key;
                let setup_fail = |e: String| {
                    release(&key, my_gen);
                    let _ = tx.send(Err(e));
                };
                prepare_dll_path(&dir);

                let ndi = match NDI::new() {
                    Ok(n) => n,
                    Err(e) => return setup_fail(e.to_string()),
                };
                let opts = FinderOptions::builder().show_local_sources(true).build();
                let finder = match Finder::new(&ndi, &opts) {
                    Ok(f) => f,
                    Err(e) => return setup_fail(e.to_string()),
                };

                let mut found = None;
                for _ in 0..4 {
                    if !is_current(&key, my_gen) {
                        return setup_fail("PREVIEW_CANCELLED".into());
                    }
                    let _ = finder.wait_for_sources(Duration::from_millis(1000));
                    if let Ok(list) = finder.sources(Duration::from_millis(0)) {
                        found = list.into_iter().find(|s| s.name == name);
                        if found.is_some() {
                            break;
                        }
                    }
                }
                let Some(source) = found else {
                    return setup_fail("SOURCE_NOT_FOUND".into());
                };

                let recv_opts = ReceiverOptions::builder(source).build();
                let receiver = match Receiver::new(&ndi, &recv_opts) {
                    Ok(r) => r,
                    Err(e) => return setup_fail(e.to_string()),
                };
                let _ = tx.send(Ok(()));

                let mut last_sent = Instant::now() - Duration::from_secs(1);
                while is_current(&key, my_gen) {
                    let frame = match receiver.capture_video(Duration::from_millis(200)) {
                        Ok(f) => f,
                        Err(_) => continue,
                    };
                    if last_sent.elapsed() < min_gap {
                        continue;
                    }
                    if let Some(jpg) = to_jpeg(&frame, max_w) {
                        if on_frame.send(InvokeResponseBody::Raw(jpg)).is_err() {
                            break; // frontend sudah tidak ada
                        }
                        last_sent = Instant::now();
                    }
                }
                release(&key, my_gen);
            })
            .map_err(|e| {
                release(&key, my_gen);
                e.to_string()
            })?;

        rx.recv_timeout(Duration::from_secs(10))
            .map_err(|_| "PREVIEW_TIMEOUT".to_string())?
    }

    /// Asumsi: data BGRA, 4 byte per piksel, stride = width * 4.
    fn to_jpeg(frame: &grafton_ndi::VideoFrame, max_w: usize) -> Option<Vec<u8>> {
        let (w, h) = (frame.width as usize, frame.height as usize);
        let stride = w * 4;
        let data = &frame.data;
        if w == 0 || h == 0 || data.len() < stride * h {
            return None;
        }
        let ow = w.min(max_w.max(16));
        let oh = (h * ow / w).max(1);

        let mut rgb = Vec::with_capacity(ow * oh * 3);
        if ow == w {
            // Tanpa resize: konversi BGRA -> RGB langsung per baris.
            for y in 0..h {
                let row = &data[y * stride..y * stride + stride];
                for px in row.chunks_exact(4) {
                    rgb.extend_from_slice(&[px[2], px[1], px[0]]);
                }
            }
        } else {
            // Resize box filter (rata-rata blok piksel): jauh lebih halus
            // daripada nearest-neighbor, teks dan garis tipis tidak bergerigi.
            for y in 0..oh {
                let y0 = y * h / oh;
                let y1 = (((y + 1) * h / oh).max(y0 + 1)).min(h);
                for x in 0..ow {
                    let x0 = x * w / ow;
                    let x1 = (((x + 1) * w / ow).max(x0 + 1)).min(w);
                    let (mut r, mut g, mut b) = (0u32, 0u32, 0u32);
                    for sy in y0..y1 {
                        let row = sy * stride;
                        for sx in x0..x1 {
                            let i = row + sx * 4;
                            b += data[i] as u32;
                            g += data[i + 1] as u32;
                            r += data[i + 2] as u32;
                        }
                    }
                    let n = ((y1 - y0) * (x1 - x0)) as u32;
                    rgb.extend_from_slice(&[(r / n) as u8, (g / n) as u8, (b / n) as u8]);
                }
            }
        }

        // Kualitas lebih tinggi untuk output besar (audience), lebih ringan untuk preview.
        let quality = if max_w > 1280 {
            90
        } else if max_w > 480 {
            80
        } else {
            70
        };

        let mut out = Vec::new();
        jpeg_encoder::Encoder::new(&mut out, quality)
            .encode(&rgb, ow as u16, oh as u16, jpeg_encoder::ColorType::Rgb)
            .ok()?;
        Some(out)
    }
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub async fn ndi_preview_start(
    window: tauri::WebviewWindow,
    name: String,
    width: Option<u32>,
    slot: Option<String>,
    on_frame: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
) -> Result<(), String> {
    let tag = slot.unwrap_or_else(|| "default".into());
    let key = format!("{}:{tag}", window.label());
    let w = width.unwrap_or(480) as usize;
    tauri::async_runtime::spawn_blocking(move || preview::start(key, name, w, on_frame))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(feature = "ndi")]
#[tauri::command]
pub fn ndi_preview_stop(window: tauri::WebviewWindow, slot: Option<String>) {
    let tag = slot.unwrap_or_else(|| "default".into());
    let key = format!("{}:{tag}", window.label());
    preview::stop(&key);
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub async fn ndi_preview_start(
    _window: tauri::WebviewWindow,
    _name: String,
    _width: Option<u32>,
    _slot: Option<String>,
    _on_frame: tauri::ipc::Channel<tauri::ipc::InvokeResponseBody>,
) -> Result<(), String> {
    Err("NDI_DISABLED".into())
}

#[cfg(not(feature = "ndi"))]
#[tauri::command]
pub fn ndi_preview_stop(_window: tauri::WebviewWindow, _slot: Option<String>) {}