//! Akses skema protobuf ProPresenter: descriptor pool + helper pembaca field
//! berdasarkan nama. Tidak tahu apa pun soal slide/layer; hanya "alat baca".

use prost_reflect::{DescriptorPool, DynamicMessage, Kind, ReflectMessage, Value};
use std::sync::OnceLock;

static DESCRIPTORS: &[u8] = include_bytes!("../../pp_descriptors.bin");

pub(super) fn pool() -> &'static DescriptorPool {
    static POOL: OnceLock<DescriptorPool> = OnceLock::new();
    POOL.get_or_init(|| DescriptorPool::decode(DESCRIPTORS).expect("descriptor tidak valid"))
}

pub(super) fn field(m: &DynamicMessage, name: &str) -> Option<Value> {
    m.get_field_by_name(name).map(|c| c.into_owned())
}

/// Pesan anak; None bila field tidak di-set (bukan pesan kosong default).
pub(super) fn msg(m: &DynamicMessage, name: &str) -> Option<DynamicMessage> {
    if !m.has_field_by_name(name) {
        return None;
    }
    match field(m, name)? {
        Value::Message(x) => Some(x),
        _ => None,
    }
}

pub(super) fn list(m: &DynamicMessage, name: &str) -> Vec<DynamicMessage> {
    match field(m, name) {
        Some(Value::List(v)) => v
            .into_iter()
            .filter_map(|x| if let Value::Message(m) = x { Some(m) } else { None })
            .collect(),
        _ => vec![],
    }
}

pub(super) fn string(m: &DynamicMessage, name: &str) -> String {
    match field(m, name) {
        Some(Value::String(s)) => s,
        _ => String::new(),
    }
}

pub(super) fn num(m: &DynamicMessage, name: &str) -> f32 {
    match field(m, name) {
        Some(Value::F32(v)) => v,
        Some(Value::F64(v)) => v as f32,
        _ => 0.0,
    }
}

pub(super) fn flag(m: &DynamicMessage, name: &str) -> bool {
    matches!(field(m, name), Some(Value::Bool(true)))
}

pub(super) fn rtf_bytes(m: &DynamicMessage, name: &str) -> Vec<u8> {
    match field(m, name) {
        Some(Value::Bytes(b)) => b.to_vec(),
        Some(Value::String(s)) => s.into_bytes(),
        _ => vec![],
    }
}

pub(super) fn uuid_of(m: &DynamicMessage) -> String {
    msg(m, "uuid").map(|u| string(&u, "string")).unwrap_or_default()
}

/// Nama enum (mis. "PLAYBACK_BEHAVIOR_LOOP") dari field bertipe enum.
pub(super) fn enum_name(m: &DynamicMessage, name: &str) -> String {
    let Some(fd) = m.descriptor().get_field_by_name(name) else {
        return String::new();
    };
    let Kind::Enum(ed) = fd.kind() else {
        return String::new();
    };
    match field(m, name) {
        Some(Value::EnumNumber(n)) => ed
            .get_value(n)
            .map(|v| v.name().to_string())
            .unwrap_or_default(),
        _ => String::new(),
    }
}

// ---------- warna ----------

fn to_byte(v: f32) -> u8 {
    (v.clamp(0.0, 1.0) * 255.0).round() as u8
}

pub(super) fn hex_color(c: &DynamicMessage) -> String {
    format!(
        "#{:02x}{:02x}{:02x}",
        to_byte(num(c, "red")),
        to_byte(num(c, "green")),
        to_byte(num(c, "blue"))
    )
}

pub(super) fn css_color(c: &DynamicMessage) -> String {
    format!(
        "rgba({},{},{},{:.3})",
        to_byte(num(c, "red")),
        to_byte(num(c, "green")),
        to_byte(num(c, "blue")),
        num(c, "alpha").clamp(0.0, 1.0)
    )
}

/// Debugging skema: cetak semua field sebuah pesan.
/// Contoh: dump_fields("rv.data.Media"); dump_fields("rv.data.Action");
#[allow(dead_code)]
pub fn dump_fields(name: &str) {
    match pool().get_message_by_name(name) {
        Some(d) => {
            for f in d.fields() {
                println!("{}.{}: {:?}", name, f.name(), f.kind());
            }
        }
        None => println!("{name}: tidak ada di skema"),
    }
}