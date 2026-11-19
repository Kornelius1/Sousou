use serde::{Deserialize, Serialize};

const KINDS: [&str; 4] = ["video", "image", "color", "input"];

fn yes() -> bool { true }
fn fill() -> String { "fill".into() }
fn one() -> f64 { 1.0 }

#[derive(Serialize, Deserialize, Clone)]
pub struct Background {
    pub src: String,
    pub kind: String,
    #[serde(rename = "loop", default = "yes")]
    pub looped: bool,
    #[serde(default = "yes")]
    pub mute: bool,
    #[serde(default = "fill")]
    pub scale: String,
    #[serde(default = "one")]
    pub opacity: f64,
    /// Hanya dipakai kind "input".
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input: Option<serde_json::Value>,
}

impl Background {
    /// Padanan `normalize()` di JS. None = data tidak valid.
    pub fn sanitize(mut self) -> Option<Self> {
        if self.src.is_empty() || !KINDS.contains(&self.kind.as_str()) {
            return None;
        }

        // image/video: src adalah path file lokal; buang kalau file sudah tidak ada
        if matches!(self.kind.as_str(), "image" | "video") {
            let is_url = self.src.starts_with("http://")
                || self.src.starts_with("https://")
                || self.src.starts_with("blob:")
                || self.src.starts_with("data:")
                || self.src.starts_with("asset:");
            if !is_url && !std::path::Path::new(&self.src).is_file() {
                return None;
            }
        }


        if self.kind == "input" {
            let ok = self.input.as_ref()
                .and_then(|i| i.get("media"))
                .and_then(|m| m.as_str()) == Some("video");
            if !ok { return None; }
        } else {
            self.input = None;
        }
        if self.scale != "fit" && self.scale != "fill" {
            self.scale = "fill".into();
        }
        self.opacity = if self.opacity.is_finite() { self.opacity.clamp(0.0, 1.0) } else { 1.0 };
        Some(self)
    }
}