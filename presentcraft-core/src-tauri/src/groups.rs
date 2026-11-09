use serde::{Deserialize, Serialize};
use std::{fs, path::Path};

fn yes() -> bool { true }
fn fill() -> String { "fill".into() }
fn one() -> f32 { 1.0 }


#[derive(Serialize, Deserialize, Clone)]
pub struct Item {
    pub id: String,
    pub src: String,
    pub kind: String, // "video" | "image" | "color" | "input" | "slide" | ...
    #[serde(default)]
    pub text: String,
    #[serde(default)]
    pub label: String,
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
    /// Menampung `input`, `slide`, `tag`, `origin`, dan field apa pun yang ditambahkan nanti.
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
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

pub fn load(dir: &Path, file: &str) -> Option<Store> {
    let p = dir.join(file);
    let s = fs::read_to_string(&p).ok()?;
    match serde_json::from_str(&s) {
        Ok(v) => Some(v),
        Err(_) => {
            let _ = fs::rename(&p, dir.join(format!("{file}.bad")));
            None
        }
    }
}

pub fn save(dir: &Path, file: &str, store: &Store) -> Result<(), String> {
    fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join(file);
    let tmp = dir.join(format!("{file}.tmp"));
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
        assert!(load(&dir, "t.json").is_none());

        let mut extra = serde_json::Map::new();
        extra.insert("input".into(), serde_json::json!({ "media": "video", "name": "Cam" }));

        let store = Store {
            groups: vec![Group {
                id: "g".into(),
                name: "Natal".into(),
                items: vec![Item {
                    id: "i".into(), src: "input://video/x".into(), kind: "input".into(),
                    text: String::new(), label: String::new(),
                    looped: false, mute: false, scale: "fit".into(), opacity: 0.6, added: 0,
                    extra,
                }],
            }],
        };
        save(&dir, "t.json", &store).unwrap();
        let back = load(&dir, "t.json").unwrap();
        let it = &back.groups[0].items[0];
        assert_eq!(it.opacity, 0.6);
        assert_eq!(it.extra["input"]["name"], "Cam"); // field input selamat
    }
}