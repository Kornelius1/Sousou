use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

fn yes() -> bool { true }
fn fill() -> String { "fill".into() }
fn one() -> f32 { 1.0 }

#[derive(Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: String,
    pub src: String,
    pub kind: String, // "video" | "image" | "color"
    #[serde(rename = "loop", default = "yes")]
    pub looped: bool,
    #[serde(default = "yes")]
    pub mute: bool,
    #[serde(default = "fill")]
    pub scale: String,
    #[serde(default = "one")]
    pub opacity: f32,
    #[serde(default)]
    pub added: u64,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Group {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub items: Vec<Item>,
}

#[derive(Serialize, Deserialize, Default)]
pub struct Store {
    #[serde(default)]
    pub groups: Vec<Group>,
}

/// None bila file belum ada (pertama kali) atau rusak (dipindah ke groups.json.bad).
pub fn load(dir: &Path) -> Option<Store> {
    let p = dir.join("groups.json");
    let s = fs::read_to_string(&p).ok()?;
    match serde_json::from_str(&s) {
        Ok(v) => Some(v),
        Err(_) => {
            let _ = fs::rename(&p, dir.join("groups.json.bad"));
            None
        }
    }
}

pub fn save(dir: &Path, store: &Store) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join("groups.json");
    let tmp = dir.join("groups.json.tmp");
    fs::write(&tmp, serde_json::to_vec_pretty(store).map_err(|e| e.to_string())?)
        .map_err(|e| e.to_string())?;
    fs::rename(&tmp, &p).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_and_missing() {
        let dir = std::env::temp_dir().join("pc_groups_test");
        let _ = fs::remove_dir_all(&dir);
        assert!(load(&dir).is_none());
        let store = Store {
            groups: vec![Group {
                id: "g".into(),
                name: "Natal".into(),
                items: vec![Item {
                    id: "i".into(), src: "a.mp4".into(), kind: "video".into(),
                    looped: true, mute: false, scale: "fit".into(), opacity: 0.6,
                }],
            }],
        };
        save(&dir, &store).unwrap();
        let back = load(&dir).unwrap();
        assert_eq!(back.groups[0].items[0].opacity, 0.6);
        assert!(!back.groups[0].items[0].mute);
    }
}