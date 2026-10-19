use crate::pro_parser::media::safe_relative;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{self, Read, Seek, Write};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use zip::{CompressionMethod, ZipArchive, ZipWriter};
use zip::write::SimpleFileOptions;

const VERSION: u64 = 2;
const MAX_ENTRIES: usize = 20_000;
const MAX_TOTAL: u64 = 20 * 1024 * 1024 * 1024; // 20 GB

#[derive(Serialize, Deserialize, Clone)]
pub struct Background {
    pub src: Option<String>,
    pub kind: String, // "video" | "image" | "color"
    #[serde(rename = "loop")]
    pub looped: bool,
    pub mute: bool,
    pub scale: String, // "fit" | "fill"
    pub opacity: f32,
}

#[derive(Deserialize)]
pub struct ExportRequest {
    pub dest: PathBuf,
    pub data: Value, // { workspace?, library?, background? }
}

fn safe_name(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, ' ' | '-' | '_' | '.') { c } else { '_' })
        .collect()
}

/// Panggil `f` untuk setiap string bernilai di kunci "path" atau "src", di mana pun letaknya.
fn walk(v: &mut Value, f: &mut dyn FnMut(&mut String)) {
    match v {
        Value::Object(m) => {
            for (k, x) in m.iter_mut() {
                if k == "path" || k == "src" {
                    if let Value::String(s) = x {
                        f(s);
                        continue;
                    }
                }
                walk(x, f);
            }
        }
        Value::Array(a) => a.iter_mut().for_each(|x| walk(x, f)),
        _ => {}
    }
}


fn e<T: std::fmt::Display>(x: T) -> String {
    x.to_string()
}


fn add_file<W: Write + Seek>(zip: &mut ZipWriter<W>, name: &str, src: &Path) -> Result<(), String> {
    // Media sudah terkompresi: simpan apa adanya. Teks/.pro: deflate.
    let method = match src.extension().and_then(|x| x.to_str()).map(|x| x.to_ascii_lowercase()).as_deref() {
        Some("pro") | Some("json") => CompressionMethod::Deflated,
        _ => CompressionMethod::Stored,
    };
    let opts = SimpleFileOptions::default().compression_method(method).large_file(true);
    zip.start_file(name, opts).map_err(e)?;
    let mut f = File::open(src).map_err(|x| format!("{}: {x}", src.display()))?;
    io::copy(&mut f, zip).map_err(e)?;
    Ok(())
}

pub fn export_session(req: ExportRequest) -> Result<Vec<String>, String> {
    let ExportRequest { dest, mut data } = req;
    let mut zip = ZipWriter::new(File::create(&dest).map_err(e)?);
    let mut map: HashMap<String, String> = HashMap::new();
    let mut order: Vec<(String, String)> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    walk(&mut data, &mut |s: &mut String| {
        let p = Path::new(s.as_str());
        if s.is_empty() || !p.is_absolute() {
            return; // warna ("#rrggbb"), teks kosong, atau sudah relatif
        }
        if let Some(rel) = map.get(s.as_str()) {
            *s = rel.clone();
            return;
        }
        if !p.is_file() {
            warnings.push(format!("file not found, not included: {s}"));
            return;
        }
        let name = p.file_name().map(|n| safe_name(&n.to_string_lossy())).unwrap_or_default();
        let rel = format!("media/{:03}-{}", order.len() + 1, name);
        map.insert(s.clone(), rel.clone());
        order.push((s.clone(), rel.clone()));
        *s = rel;
    });

    for (abs, rel) in &order {
        add_file(&mut zip, rel, Path::new(abs))?;
    }

    data["version"] = Value::from(VERSION);
    zip.start_file("manifest.json", SimpleFileOptions::default()).map_err(e)?;
    zip.write_all(&serde_json::to_vec(&data).map_err(e)?).map_err(e)?;
    zip.finish().map_err(e)?;
    Ok(warnings)
}

fn extract(pack: &Path, dir: &Path) -> Result<(), String> {
    let mut ar = ZipArchive::new(File::open(pack).map_err(e)?).map_err(e)?;
    if ar.len() > MAX_ENTRIES {
        return Err("paket memiliki terlalu banyak entri".into());
    }
    let mut total = 0u64;
    for i in 0..ar.len() {
        let mut f = ar.by_index(i).map_err(e)?;
        // enclosed_name menolak ".." dan path absolut (zip-slip)
        let rel = f.enclosed_name().ok_or_else(|| format!("entri tidak aman: {}", f.name()))?;
        if f.is_dir() {
            continue;
        }
        let out = dir.join(rel);
        if let Some(parent) = out.parent() {
            fs::create_dir_all(parent).map_err(e)?;
        }
        // ukuran di header bisa bohong; batasi dari yang benar-benar terbaca
        let n = io::copy(&mut (&mut f).take(MAX_TOTAL - total + 1), &mut File::create(out).map_err(e)?).map_err(e)?;
        total += n;
        if total > MAX_TOTAL {
            return Err("isi paket melebihi batas ukuran".into());
        }
    }
    Ok(())
}

pub fn import_session(pack: &Path, data_dir: &Path) -> Result<Value, String> {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let dir = data_dir.join("sessions").join(stamp.to_string());
    fs::create_dir_all(&dir).map_err(e)?;

    let result = (|| -> Result<Value, String> {
        extract(pack, &dir)?;
        let mut s = String::new();
        File::open(dir.join("manifest.json"))
            .map_err(|_| "manifest.json not found in package")?
            .read_to_string(&mut s)
            .map_err(e)?;
        let mut v: Value = serde_json::from_str(&s).map_err(|x| format!("corrupt manifest: {x}"))?;
        let ver = v["version"].as_u64().unwrap_or(0);
        if ver != VERSION {
            return Err(format!("unsupported package version {ver} (expected {VERSION})"));
        }
        let mut bad: Option<String> = None;
        walk(&mut v, &mut |s: &mut String| {
            if s.starts_with("media/") {
                if safe_relative(s) {
                    let abs = dir.join(s.as_str()).to_string_lossy().replace('\\', "/");
                    *s = abs;
                } else {
                    bad = Some(s.clone());
                }
            }
        });
        if let Some(b) = bad {
            return Err(format!("unsafe path in manifest: {b}"));
        }
        Ok(v)
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}