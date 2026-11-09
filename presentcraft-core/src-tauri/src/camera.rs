use axum::{
    body::Body,
    extract::{Path, State as AxState},
    http::{header, StatusCode},
    response::Response,
    routing::get,
    Router,
};
use bytes::Bytes;
use futures_util::StreamExt;
use nokhwa::{
    pixel_format::RgbFormat,
    utils::{ApiBackend, CameraIndex, FrameFormat, RequestedFormat,
            RequestedFormatType},
    Buffer, Camera,
};
use serde::Serialize;
use std::{
    collections::HashMap,
    sync::{atomic::{AtomicBool, AtomicU16, Ordering}, Arc, Mutex},
    time::Duration,
};
use tauri::State;
use tokio::sync::watch;
use tokio_stream::wrappers::WatchStream;

struct Cam {
    id: String,
    tx: watch::Sender<Bytes>, // frame JPEG terbaru; kosong = belum ada frame
    stop: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct Inner {
    cams: Mutex<HashMap<String, Cam>>, // nama kamera -> Cam
    port: AtomicU16,
    next: Mutex<u32>,
}
#[derive(Clone, Default)]
pub struct CameraHub(Arc<Inner>);

#[derive(Serialize)]
pub struct CamInfo { name: String }

// ---------- capture ----------
fn find_index(name: &str) -> Option<u32> {
    let list = nokhwa::query(ApiBackend::Auto).ok()?;
    list.into_iter()
        .find(|c| c.human_name() == name)
        .and_then(|c| c.index().as_index().ok())
}

fn to_jpeg(f: &Buffer) -> Option<Vec<u8>> {
    if f.source_frame_format() == FrameFormat::MJPEG {
        return Some(f.buffer().to_vec()); // webcam MJPEG: sudah JPEG, tanpa encode ulang
    }
    let img = f.decode_image::<RgbFormat>().ok()?; // YUY2/NV12 dll
    let mut out = Vec::new();
    jpeg_encoder::Encoder::new(&mut out, 85)
        .encode(img.as_raw(), img.width() as u16, img.height() as u16,
                jpeg_encoder::ColorType::Rgb)
        .ok()?;
    Some(out)
}

fn capture_loop(name: String, tx: watch::Sender<Bytes>, stop: Arc<AtomicBool>) {
    while !stop.load(Ordering::Relaxed) {
        let Some(idx) = find_index(&name) else {
            tx.send_replace(Bytes::new());
            std::thread::sleep(Duration::from_secs(1));
            continue;
        };
        let fmt = RequestedFormat::new::<RgbFormat>(
            RequestedFormatType::AbsoluteHighestFrameRate,
        );
        let mut cam = match Camera::new(CameraIndex::Index(idx), fmt) {
            Ok(c) => c,
            Err(e) => { eprintln!("cam {name}: {e}"); std::thread::sleep(Duration::from_secs(1)); continue; }
        };
        if let Err(e) = cam.open_stream() {
            eprintln!("cam {name}: {e}");
            std::thread::sleep(Duration::from_secs(1));
            continue;
        }
        while !stop.load(Ordering::Relaxed) {
            match cam.frame() {
                Ok(f) => { if let Some(j) = to_jpeg(&f) { tx.send_replace(Bytes::from(j)); } }
                Err(_) => break, // kabel tercabut / error: keluar, coba buka ulang
            }
        }
        let _ = cam.stop_stream();
    }
    tx.send_replace(Bytes::new());
}

// ---------- server MJPEG ----------
async fn serve_cam(AxState(hub): AxState<CameraHub>, Path(id): Path<String>) -> Response {
    let rx = {
        let cams = hub.0.cams.lock().unwrap();
        cams.values().find(|c| c.id == id).map(|c| c.tx.subscribe())
    };
    let Some(rx) = rx else {
        return Response::builder().status(StatusCode::NOT_FOUND).body(Body::empty()).unwrap();
    };
    let stream = WatchStream::new(rx)
        .filter(|b| futures_util::future::ready(!b.is_empty()))
        .map(|jpeg| {
            let mut v = Vec::with_capacity(jpeg.len() + 96);
            v.extend_from_slice(
                format!("--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {}\r\n\r\n", jpeg.len())
                    .as_bytes(),
            );
            v.extend_from_slice(&jpeg);
            v.extend_from_slice(b"\r\n");
            Ok::<_, std::convert::Infallible>(Bytes::from(v))
        });
    Response::builder()
        .header(header::CONTENT_TYPE, "multipart/x-mixed-replace; boundary=frame")
        .header(header::CACHE_CONTROL, "no-store")
        .body(Body::from_stream(stream))
        .unwrap()
}

/// Panggil dari `setup`. Port dipilih otomatis, hanya 127.0.0.1.
pub fn start_server(hub: CameraHub) -> std::io::Result<()> {
    let l = std::net::TcpListener::bind("127.0.0.1:0")?;
    l.set_nonblocking(true)?;
    hub.0.port.store(l.local_addr()?.port(), Ordering::Relaxed);
    let app = Router::new().route("/cam/:id", get(serve_cam)).with_state(hub);
    tauri::async_runtime::spawn(async move {
        let l = tokio::net::TcpListener::from_std(l).unwrap();
        let _ = axum::serve(l, app).await;
    });
    Ok(())
}

// ---------- command Tauri ----------
#[tauri::command]
pub async fn cam_list() -> Result<Vec<CamInfo>, String> {
    tauri::async_runtime::spawn_blocking(|| {
        nokhwa::query(ApiBackend::Auto)
            .map(|l| l.into_iter().map(|c| CamInfo { name: c.human_name() }).collect())
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Idempoten: kamera yang sama tidak dibuka dua kali. Mengembalikan URL stream.
#[tauri::command]
pub fn cam_start(hub: State<CameraHub>, name: String) -> Result<String, String> {
    let port = hub.0.port.load(Ordering::Relaxed);
    let mut cams = hub.0.cams.lock().unwrap();
    if let Some(c) = cams.get(&name) {
        return Ok(format!("http://127.0.0.1:{port}/cam/{}", c.id));
    }
    let id = {
        let mut n = hub.0.next.lock().unwrap();
        *n += 1;
        n.to_string()
    };
    let (tx, _rx) = watch::channel(Bytes::new());
    let stop = Arc::new(AtomicBool::new(false));
    let (n2, tx2, s2) = (name.clone(), tx.clone(), stop.clone());
    std::thread::spawn(move || capture_loop(n2, tx2, s2));
    cams.insert(name, Cam { id: id.clone(), tx, stop });
    Ok(format!("http://127.0.0.1:{port}/cam/{id}"))
}

#[tauri::command]
pub fn cam_stop(hub: State<CameraHub>, name: String) {
    if let Some(c) = hub.0.cams.lock().unwrap().remove(&name) {
        c.stop.store(true, Ordering::Relaxed);
    }
}