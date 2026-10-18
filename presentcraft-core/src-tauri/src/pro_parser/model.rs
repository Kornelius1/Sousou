//! Tipe data keluaran parser (dikirim ke frontend lewat serde).

use serde::Serialize;

/// Persegi dalam persen (0..100).
#[derive(Serialize, Debug, Clone)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

/// Satu lapisan visual. `kind`: "video" | "image" | "color" | "text".
/// Field Option bernilai None bila tidak relevan / tidak ada di data.
#[derive(Serialize, Debug, Clone)]
pub struct Layer {
    pub kind: String,
    /// Urutan tumpukan (indeks elemen); makin besar makin di depan.
    pub z: usize,
    /// Kotak elemen, persen terhadap ukuran slide.
    pub rect: Rect,
    pub rotation: f32,
    pub opacity: f32,
    // media
    pub path: Option<String>,
    pub status: Option<String>,
    /// Path relatif persis seperti tertulis di .pro. Hanya untuk ekspor paket
    /// sesi (session_pack), tidak dikirim ke frontend.
    #[serde(skip)]
    pub rel: Option<String>,
    /// Area gambar di dalam kotak (custom_image_bounds), persen terhadap kotak.
    pub inner: Option<Rect>,
    /// Nama enum scale_behavior mentah, mis. "SCALE_BEHAVIOR_FIT".
    pub scale: Option<String>,
    // khusus video
    pub muted: Option<bool>,
    pub looped: Option<bool>,
    pub stop_on_clear: Option<bool>,
    // fill warna (CSS rgba)
    pub color: Option<String>,
    // teks
    pub text: Option<String>,
}

impl Layer {
    pub(super) fn new(kind: &str, z: usize, rect: Rect, rotation: f32, opacity: f32) -> Self {
        Layer {
            kind: kind.into(),
            z,
            rect,
            rotation,
            opacity,
            path: None,
            status: None,
            rel: None,
            inner: None,
            scale: None,
            muted: None,
            looped: None,
            stop_on_clear: None,
            color: None,
            text: None,
        }
    }
}

#[derive(Serialize, Debug)]
pub struct Slide {
    pub slide_number: usize,
    /// Gabungan semua teks pada slide (sudah tanpa RTF).
    pub content: String,
    pub group_name: String,
    pub group_color: String,
    pub song: String,
    /// Path lapisan media pertama (kompatibilitas dengan frontend lama).
    pub background_media: Option<String>,
    pub media_status: Option<String>,
    pub slide_width: f32,
    pub slide_height: f32,
    pub layers: Vec<Layer>,
}

#[derive(Serialize, Debug)]
pub struct ParsedPro {
    pub slides: Vec<Slide>,
    pub warnings: Vec<String>,
}