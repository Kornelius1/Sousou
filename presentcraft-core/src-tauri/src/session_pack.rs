use crate::parser::media::safe_relative;
use crate::parser::parse_pro_file;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::{self, Read, Seek, Write};
use std::path::{Path, PathBuf};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

const VERSION: u32 = 1;
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

#[derive(Serialize, Deserialize)]
struct PresEntry {
    file: String,
    name: String,
}

#[derive(Serialize, Deserialize)]
struct Manifest {
    version: u32,
    background: Option<Background>,
    presentations: Vec<PresEntry>,
    active: Option<usize>,
}

#[derive(Deserialize)]
pub struct PresInput {
    pub path: PathBuf,
    pub media_root: PathBuf,
}

#[derive(Deserialize)]
pub struct ExportRequest {
    pub dest: PathBuf,
    pub background: Option<Background>,
    pub presentations: Vec<PresInput>,
    pub active: Option<usize>,
}

#[derive(Serialize)]
pub struct ImportedPres {
    pub name: String,
    pub path: String,
    pub media_root: String,
}

#[derive(Serialize)]
pub struct ImportedSession {
    pub background: Option<Background>, // src sudah absolut
    pub presentations: Vec<ImportedPres>,
    pub active: Option<usize>,
}

fn e<T: std::fmt::Display>(x: T) -> String {
    x.to_string()
}

fn sanitize(s: &str) -> String {
    s.chars()
        .map(|c| if c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' { c } else { '_' })
        .collect()
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

/// Mengembalikan daftar peringatan (mis. media yang hilang dan tidak disertakan).
pub fn export_session(req: ExportRequest) -> Result<Vec<String>, String> {
    let mut zip = ZipWriter::new(File::create(&req.dest).map_err(e)?);
    let mut warnings = Vec::new();
    let mut added: HashSet<String> = HashSet::new();
    let mut entries = Vec::new();

    for (i, p) in req.presentations.iter().enumerate() {
        let parsed = parse_pro_file(&p.path, &p.media_root)?;
        let name = p.path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
        let file = format!("presentations/{:03}-{}.pro", i + 1, sanitize(&name));
        add_file(&mut zip, &file, &p.path)?;
        entries.push(PresEntry { file, name });

        for l in parsed.slides.iter().flat_map(|s| &s.layers) {
            let (Some(rel), Some(full)) = (&l.rel, &l.path) else { continue };
            if l.status.as_deref() != Some("OK") {
                warnings.push(format!("media tidak ditemukan, tidak disertakan: {rel}"));
                continue;
            }
            let name = format!("media/{rel}");
            if added.insert(name.clone()) {
                add_file(&mut zip, &name, Path::new(full))?;
            }
        }
    }

    let mut background = req.background;
    if let Some(bg) = background.as_mut() {
        if bg.kind != "color" {
            let src = bg.src.take().map(PathBuf::from);
            match src.as_deref().and_then(|p| p.file_name().map(|n| (p, n))) {
                Some((p, n)) if p.is_file() => {
                    let name = format!("background/{}", n.to_string_lossy());
                    add_file(&mut zip, &name, p)?;
                    bg.src = Some(name);
                }
                _ => warnings.push("file background tidak ditemukan, dilewati".into()),
            }
        }
    }

    let manifest = Manifest { version: VERSION, background, presentations: entries, active: req.active };
    zip.start_file("manifest.json", SimpleFileOptions::default()).map_err(e)?;
    zip.write_all(&serde_json::to_vec_pretty(&manifest).map_err(e)?).map_err(e)?;
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

pub fn import_session(pack: &Path, data_dir: &Path) -> Result<ImportedSession, String> {
    let sessions = data_dir.join("sessions");
    let _ = fs::remove_dir_all(&sessions); // hanya simpan sesi terakhir
    let dir = sessions.join("current");
    fs::create_dir_all(&dir).map_err(e)?;

    let result = (|| {
        extract(pack, &dir)?;
        let mut s = String::new();
        File::open(dir.join("manifest.json"))
            .map_err(|_| "manifest.json tidak ada di paket")?
            .read_to_string(&mut s)
            .map_err(e)?;
        let m: Manifest = serde_json::from_str(&s).map_err(|x| format!("manifest rusak: {x}"))?;
        if m.version > VERSION {
            return Err(format!("versi paket {} lebih baru dari yang didukung ({VERSION})", m.version));
        }

        let abs = |rel: &str| -> Result<String, String> {
            if !safe_relative(rel) {
                return Err(format!("path tidak aman di manifest: {rel}"));
            }
            Ok(dir.join(rel).to_string_lossy().replace('\\', "/"))
        };

        let mut background = m.background;
        if let Some(bg) = background.as_mut() {
            if let Some(src) = bg.src.take() {
                bg.src = Some(abs(&src)?);
            }
        }
        let media_root = dir.join("media").to_string_lossy().replace('\\', "/");
        let presentations = m
            .presentations
            .iter()
            .map(|p| Ok(ImportedPres { name: p.name.clone(), path: abs(&p.file)?, media_root: media_root.clone() }))
            .collect::<Result<Vec<_>, String>>()?;
        Ok(ImportedSession { background, presentations, active: m.active })
    })();

    if result.is_err() {
        let _ = fs::remove_dir_all(&dir);
    }
    result
}