//! Dari satu cue → daftar lapisan (video/gambar/warna/teks) dan satu Slide.
//! Semua setelan dibaca per elemen dari data; tidak ada asumsi nomor slide.

use super::media::{safe_relative, MediaResolver};
use super::model::{Layer, Rect, Slide};
use super::rtf::rtf_to_text;
use super::reflect::{css_color, enum_name, flag, list, msg, num, string};
use super::reflect::rtf_bytes;
use prost_reflect::DynamicMessage;

// ---------- geometri ----------

fn element_box(e: &DynamicMessage, sw: f32, sh: f32) -> Option<(Rect, (f32, f32))> {
    let b = msg(e, "bounds")?;
    let size = msg(&b, "size")?;
    let (x, y) = msg(&b, "origin")
        .map(|o| (num(&o, "x"), num(&o, "y")))
        .unwrap_or((0.0, 0.0));
    let (w, h) = (num(&size, "width"), num(&size, "height"));
    if w <= 0.0 || h <= 0.0 || sw <= 0.0 || sh <= 0.0 {
        return None;
    }
    Some((
        Rect {
            x: x / sw * 100.0,
            y: y / sh * 100.0,
            w: w / sw * 100.0,
            h: h / sh * 100.0,
        },
        (w, h),
    ))
}

// ---------- media ----------

/// Ubah kerangka lapisan menjadi lapisan video/gambar dari pesan Media.
fn media_layer(
    media: &DynamicMessage,
    mut layer: Layer,
    box_px: (f32, f32),
    resolver: &MediaResolver,
    warnings: &mut Vec<String>,
) -> Option<Layer> {
    let is_video = media.has_field_by_name("video");
    let is_image = media.has_field_by_name("image");
    if !is_video && !is_image {
        warnings.push(format!(
            "elemen z={}: tipe media tidak dikenal (bukan video/gambar)",
            layer.z
        ));
        return None;
    }
    let sub = msg(media, if is_video { "video" } else { "image" });

    let local_path = |u: DynamicMessage| {
        msg(&u, "local")
            .map(|l| string(&l, "path"))
            .filter(|p| !p.is_empty())
    };
    let rel = msg(media, "url").and_then(local_path).or_else(|| {
        sub.as_ref()
            .and_then(|s| msg(s, "file"))
            .and_then(|f| msg(&f, "local_url"))
            .and_then(local_path)
    });
    let Some(rel) = rel else {
        warnings.push(format!(
            "elemen z={}: media tanpa path lokal (mungkin URL eksternal)",
            layer.z
        ));
        return None;
    };
    if !safe_relative(&rel) {
        warnings.push(format!("elemen z={}: path media tidak aman ditolak: {rel}", layer.z));
        return None;
    }

    let (full, exists) = resolver.resolve(&rel);
    layer.kind = if is_video { "video" } else { "image" }.into();
    layer.path = Some(full.to_string_lossy().replace('\\', "/"));
    layer.rel = Some(rel.clone());
    layer.status = Some(if exists { "OK" } else { "File media tidak ditemukan" }.into());

    // drawing: area gambar kustom & mode skala
    if let Some(drawing) = sub.as_ref().and_then(|s| msg(s, "drawing")) {
        if let Some(c) = msg(&drawing, "custom_image_bounds") {
            if let Some(s) = msg(&c, "size") {
                let (ix, iy) = msg(&c, "origin")
                    .map(|o| (num(&o, "x"), num(&o, "y")))
                    .unwrap_or((0.0, 0.0));
                layer.inner = Some(Rect {
                    x: ix / box_px.0 * 100.0,
                    y: iy / box_px.1 * 100.0,
                    w: num(&s, "width") / box_px.0 * 100.0,
                    h: num(&s, "height") / box_px.1 * 100.0,
                });
            }
        }
        let sc = enum_name(&drawing, "scale_behavior");
        if !sc.is_empty() {
            layer.scale = Some(sc);
        }
    }

    if is_video {
        let v = sub.as_ref();
        // mute: semua channel audio ber-muted (None bila tak ada info channel)
        layer.muted = v.and_then(|v| msg(v, "audio")).and_then(|a| {
            let ch = list(&a, "audio_channels");
            if ch.is_empty() {
                None
            } else {
                Some(ch.iter().all(|c| flag(c, "muted")))
            }
        });
        layer.looped = v
            .and_then(|v| msg(v, "transport"))
            .map(|t| enum_name(&t, "playback_behavior").ends_with("LOOP"));
        layer.stop_on_clear = v
            .and_then(|v| msg(v, "video"))
            .map(|x| enum_name(&x, "end_behavior").ends_with("STOP_ON_CLEAR"));
    }
    Some(layer)
}

// ---------- pengumpulan per cue ----------

struct Acc {
    layers: Vec<Layer>,
    texts: Vec<String>,
    w: f32,
    h: f32,
    z: usize,
}

fn collect_base_slide(
    base: &DynamicMessage,
    resolver: &MediaResolver,
    warnings: &mut Vec<String>,
    acc: &mut Acc,
) {
    if let Some(sz) = msg(base, "size") {
        let (w, h) = (num(&sz, "width"), num(&sz, "height"));
        if w > 0.0 && h > 0.0 {
            acc.w = w;
            acc.h = h;
        }
    }

    for el in list(base, "elements") {
        let z = acc.z;
        acc.z += 1;
        let Some(e) = msg(&el, "element") else { continue };
        let Some((rect, box_px)) = element_box(&e, acc.w, acc.h) else {
            warnings.push(format!("elemen z={z}: bounds tidak valid, dilewati"));
            continue;
        };
        // Catatan: proto3 menghilangkan nilai 0. ProPresenter menulis opacity: 1
        // secara eksplisit, jadi opacity yang hilang berarti 0 (tak terlihat).
        let rotation = num(&e, "rotation");
        let opacity = num(&e, "opacity");
        let skeleton = |kind: &str| Layer::new(kind, z, rect.clone(), rotation, opacity);

        // Fill hanya dihitung bila enable: true
        if let Some(fill) = msg(&e, "fill").filter(|f| flag(f, "enable")) {
            if let Some(media) = msg(&fill, "media") {
                if let Some(l) = media_layer(&media, skeleton("video"), box_px, resolver, warnings) {
                    acc.layers.push(l);
                }
            } else if let Some(c) = msg(&fill, "color") {
                let mut l = skeleton("color");
                l.color = Some(css_color(&c));
                acc.layers.push(l);
            } else {
                warnings.push(format!(
                    "elemen z={z}: tipe fill belum didukung (gradient/lainnya)"
                ));
            }
        }

        if let Some(t) = msg(&e, "text") {
            let txt = rtf_to_text(&rtf_bytes(&t, "rtf_data"));
            if !txt.is_empty() {
                let mut l = skeleton("text");
                l.text = Some(txt.clone());
                acc.layers.push(l);
                acc.texts.push(txt);
            }
        }
    }
}

fn collect_cue(cue: &DynamicMessage, resolver: &MediaResolver, warnings: &mut Vec<String>) -> Acc {
    let mut acc = Acc { layers: vec![], texts: vec![], w: 1366.0, h: 768.0, z: 0 };
    for action in list(cue, "actions") {
        let ty = enum_name(&action, "type");
        match ty.as_str() {
            "ACTION_TYPE_PRESENTATION_SLIDE" => {
                let base = msg(&action, "slide")
                    .and_then(|s| msg(&s, "presentation"))
                    .and_then(|p| msg(&p, "base_slide"));
                match base {
                    Some(b) => collect_base_slide(&b, resolver, warnings, &mut acc), 
                    None => warnings.push("action slide tanpa base_slide".into()),
                }
            }
            "ACTION_TYPE_MEDIA" => {
                let media = msg(&action, "media").and_then(|m| msg(&m, "element"));
                match media {
                    Some(m) => {
                        let z = acc.z;
                        acc.z += 1;
                        let full = Rect { x: 0.0, y: 0.0, w: 100.0, h: 100.0 };
                        let mut skeleton = Layer::new("video", z, full, 0.0, 1.0);
                        skeleton.rel = None;
                        if let Some(l) = media_layer(&m, skeleton, (acc.w, acc.h), resolver, warnings) {
                            acc.layers.push(l);
                        }
                    }
                    None => warnings.push("action media tanpa elemen media terbaca".into()),
                }
            }
            "" => warnings.push("action tanpa tipe terbaca".into()),
            other => warnings.push(format!("tipe action belum didukung: {other}")),
        }
    }
    acc
}

/// Bangun satu Slide dari cue; None bila cue tidak punya teks maupun visual.
pub(super) fn build_slide(
    number: usize,
    cue: &DynamicMessage,
    group_name: &str,
    group_color: &str,
    song: &str,
    resolver: &MediaResolver,
    warnings: &mut Vec<String>,
) -> Option<Slide> {
    let acc = collect_cue(cue, resolver, warnings);
    if acc.layers.is_empty() {
        return None;
    }
    let first_media = acc
        .layers
        .iter()
        .find(|l| l.kind == "video" || l.kind == "image");
    Some(Slide {
        slide_number: number,
        content: acc.texts.join("\n"),
        group_name: group_name.to_string(),
        group_color: group_color.to_string(),
        song: song.to_string(),
        background_media: first_media.and_then(|l| l.path.clone()),
        media_status: Some(
            first_media
                .and_then(|l| l.status.clone())
                .unwrap_or_else(|| "No media".into()),
        ),
        slide_width: acc.w,
        slide_height: acc.h,
        layers: acc.layers,
    })
}