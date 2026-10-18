//! Parser file .pro (ProPresenter 7+) → daftar slide untuk PresentCraft.
//!
//! Peta modul:
//!   model.rs   tipe keluaran (Slide, Layer, Rect, ParsedPro)
//!   reflect.rs descriptor pool + helper pembaca field protobuf
//!   rtf.rs     RTF → teks biasa
//!   media.rs   keamanan path + pencarian file media
//!   layers.rs  cue → lapisan → Slide
//!   mod.rs     alur utama: decode, urutan grup/arrangement, rakit hasil
//!
//! Prinsip: semua setelan dibaca per elemen dari data, tanpa asumsi nomor
//! slide. Yang belum dikenali dicatat di `warnings`, bukan dibuang diam-diam.

mod layers;
mod media;
mod model;
mod reflect;
mod rtf;

pub use media::MediaResolver;
pub use model::{ParsedPro, Slide};
#[allow(unused_imports)]
pub use reflect::dump_fields;

use layers::build_slide;
use prost_reflect::DynamicMessage;
use reflect::{hex_color, list, msg, pool, string, uuid_of};
use std::collections::{HashMap, HashSet};
use std::path::Path;

// ---------- urutan: arrangement terpilih ----------

fn ordered_groups<'a>(
    pres: &DynamicMessage,
    groups: &'a [DynamicMessage],
) -> Vec<&'a DynamicMessage> {
    let by_uuid: HashMap<String, &'a DynamicMessage> = groups
        .iter()
        .filter_map(|g| msg(g, "group").map(|x| (uuid_of(&x), g)))
        .collect();
    let selected = msg(pres, "selected_arrangement")
        .map(|u| string(&u, "string"))
        .unwrap_or_default();

    let mut result: Vec<&'a DynamicMessage> = Vec::new();
    if let Some(arr) = list(pres, "arrangements")
        .into_iter()
        .find(|a| uuid_of(a) == selected)
    {
        let ids = list(&arr, "group_identifiers");
        for id in &ids {
            if let Some(g) = by_uuid.get(&string(id, "string")) {
                result.push(*g);
            }
        }
    }
    if result.is_empty() {
        groups.iter().collect() // tanpa arrangement: urutan cue_groups
    } else {
        result
    }
}

// ---------- API publik ----------

/// Parse satu file .pro. `media_root` adalah folder tempat media dicari.
pub fn parse_pro_file(path: &Path, media_root: &Path) -> Result<ParsedPro, String> {
    parse_pro_file_with(path, &MediaResolver::new(media_root))
}

/// Seperti `parse_pro_file`, tapi memakai resolver yang sudah ada sehingga
/// indeks nama file bisa dipakai ulang di banyak file .pro dalam satu bundel.
pub fn parse_pro_file_with(path: &Path, resolver: &MediaResolver) -> Result<ParsedPro, String> {
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let desc = pool()
        .get_message_by_name("rv.data.Presentation")
        .ok_or("rv.data.Presentation tidak ada di skema")?;
    let pres = DynamicMessage::decode(desc, bytes.as_slice())
        .map_err(|e| format!("decode gagal: {e}"))?;

    let song = msg(&pres, "ccli")
        .map(|c| string(&c, "song_title"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| string(&pres, "name"));

    let all_cues = list(&pres, "cues");
    let cues: HashMap<String, &DynamicMessage> =
        all_cues.iter().map(|c| (uuid_of(c), c)).collect();

    let mut warnings: Vec<String> = Vec::new();
    let mut slides: Vec<Slide> = Vec::new();

    let groups = list(&pres, "cue_groups");
    if groups.is_empty() {
        // Tanpa grup: pakai urutan cue apa adanya
        for cue in &all_cues {
            if let Some(s) = build_slide(slides.len() + 1, cue, "", "", &song, resolver, &mut warnings) {
                slides.push(s);
            }
        }
    } else {
        for g in ordered_groups(&pres, &groups) {
            let group = msg(g, "group");
            let name = group
                .as_ref()
                .map(|x| string(x, "name"))
                .unwrap_or_default();
            let color = group
                .as_ref()
                .and_then(|x| msg(x, "color"))
                .map(|c| hex_color(&c))
                .unwrap_or_default();

            for id in list(g, "cue_identifiers") {
                let key = string(&id, "string");
                let Some(cue) = cues.get(&key) else {
                    warnings.push(format!("cue {key} dirujuk grup '{name}' tapi tidak ada"));
                    continue;
                };
                if let Some(s) = build_slide(
                    slides.len() + 1,
                    cue,
                    &name,
                    &color,
                    &song,
                    resolver,
                    &mut warnings,
                ) {
                    slides.push(s);
                }
            }
        }
    }

    let mut seen = HashSet::new();
    warnings.retain(|w| seen.insert(w.clone()));
    Ok(ParsedPro { slides, warnings })
}

// ---------- tes integrasi ----------

#[cfg(test)]
mod tests {
    use super::*;

    /// Menguji invarian umum untuk setiap *.pro di tests/fixtures/,
    /// tanpa mengandalkan isi satu file tertentu.
    #[test]
    fn fixtures_invariants() {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures");
        let Ok(rd) = std::fs::read_dir(&dir) else { return };
        for e in rd.flatten() {
            let p = e.path();
            if p.extension().and_then(|x| x.to_str()) != Some("pro") {
                continue;
            }
            let r = parse_pro_file(&p, &dir).unwrap_or_else(|err| panic!("{p:?}: {err}"));
            for (i, s) in r.slides.iter().enumerate() {
                assert_eq!(s.slide_number, i + 1, "{p:?}");
                for l in &s.layers {
                    assert!(l.rect.w > 0.0 && l.rect.h > 0.0, "{p:?}: rect tak valid");
                    assert!(l.rect.x.is_finite() && l.rect.y.is_finite());
                    match l.kind.as_str() {
                        "video" | "image" => assert!(l.path.is_some(), "{p:?}"),
                        "color" => assert!(l.color.is_some(), "{p:?}"),
                        "text" => assert!(l.text.is_some(), "{p:?}"),
                        k => panic!("{p:?}: kind tak dikenal {k}"),
                    }
                    if l.kind != "video" {
                        assert!(l.muted.is_none() && l.looped.is_none());
                    }
                }
            }
        }
    }
}