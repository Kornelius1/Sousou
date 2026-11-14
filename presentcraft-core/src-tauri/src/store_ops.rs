use crate::groups::{Group, Item, Store};
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::time::{SystemTime, UNIX_EPOCH};

const VIDEO: [&str; 5] = ["mp4", "mov", "m4v", "webm", "mkv"];
const IMAGE: [&str; 6] = ["png", "jpg", "jpeg", "gif", "webp", "bmp"];
const AUDIO: [&str; 6] = ["mp3", "wav", "m4a", "ogg", "flac", "aac"];

pub fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
pub fn new_id() -> String {
    uuid::Uuid::new_v4().to_string()
}

fn ext(path: &str) -> String {
    path.rsplit('.').next().unwrap_or("").to_lowercase()
}

/// Padanan `kindOf` (media.js): hanya video/image.
pub fn kind_of(path: &str) -> Option<&'static str> {
    let e = ext(path);
    if VIDEO.contains(&e.as_str()) {
        Some("video")
    } else if IMAGE.contains(&e.as_str()) {
        Some("image")
    } else {
        None
    }
}

/// Padanan `libKindOf`: video/image/audio, selain itu "file".
pub fn lib_kind_of(path: &str) -> &'static str {
    kind_of(path).unwrap_or_else(|| if AUDIO.contains(&ext(path).as_str()) { "audio" } else { "file" })
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum Outcome {
    Ok,
    Dup,
    NotFound,
}

impl Item {
    pub fn base() -> Item {
        Item {
            id: new_id(),
            src: String::new(),
            kind: String::new(),
            text: String::new(),
            label: String::new(),
            looped: true,
            mute: true,
            scale: "fill".into(),
            opacity: 1.0,
            added: now_ms(),
            extra: Map::new(),
        }
    }

    /// Padanan `sameItem`.
    pub fn same(&self, o: &Item) -> bool {
        self.kind == o.kind
            && match self.kind.as_str() {
                "slide" => self.id == o.id,
                "text" => self.text == o.text,
                _ => self.src == o.src,
            }
    }

    /// Padanan `itemName`.
    pub fn name(&self) -> String {
        let non_empty = |s: &str| if s.is_empty() { None } else { Some(s.to_string()) };
        match self.kind.as_str() {
            "color" => self.src.clone(),
            "input" => self
                .extra
                .get("input")
                .and_then(|i| i.get("name"))
                .and_then(|n| n.as_str())
                .and_then(non_empty)
                .or_else(|| non_empty(&self.label))
                .unwrap_or_else(|| "Input".into()),
            "text" | "slide" => non_empty(&self.label)
                .unwrap_or_else(|| self.text.chars().take(30).collect()),
            _ => self.src.rsplit(|c| c == '/' || c == '\\').next().unwrap_or("").to_string(),
        }
    }

    /// Gabungkan field acak (dari JS) ke item ini. None kalau tipenya tidak cocok.
    fn merged(&self, patch: &Map<String, Value>) -> Option<Item> {
        let mut v = serde_json::to_value(self).ok()?;
        v.as_object_mut()?.extend(patch.clone());
        serde_json::from_value(v).ok()
    }
}

impl Store {
    fn group_mut(&mut self, id: &str) -> Option<&mut Group> {
        self.groups.iter_mut().find(|g| g.id == id)
    }

    pub fn create_group(&mut self, name: &str) -> Group {
        let g = Group { id: new_id(), name: name.to_string(), items: vec![] };
        self.groups.push(g.clone());
        g
    }

    pub fn rename_group(&mut self, id: &str, name: &str) -> bool {
        let n = name.trim();
        match self.group_mut(id) {
            Some(g) if !n.is_empty() => {
                g.name = n.to_string();
                true
            }
            _ => false,
        }
    }

    pub fn delete_group(&mut self, id: &str) -> bool {
        let before = self.groups.len();
        self.groups.retain(|g| g.id != id);
        self.groups.len() != before
    }

    /// `any_kind` true = library (audio/file ikut), false = background (hanya video/image).
    pub fn add_files(&mut self, gid: &str, paths: &[String], any_kind: bool) -> usize {
        let Some(g) = self.group_mut(gid) else { return 0 };
        let mut n = 0;
        for p in paths {
            let kind = if any_kind { Some(lib_kind_of(p)) } else { kind_of(p) };
            let Some(kind) = kind else { continue };
            let mut it = Item::base();
            it.src = p.clone();
            it.kind = kind.into();
            if g.items.iter().any(|x| x.same(&it)) {
                continue;
            }
            g.items.push(it);
            n += 1;
        }
        n
    }

    pub fn add_input(&mut self, gid: &str, cfg: Value) -> Option<Item> {
        let g = self.group_mut(gid)?;
        let media = cfg.get("media").and_then(|m| m.as_str()).unwrap_or("undefined");
        let mut it = Item::base();
        it.kind = "input".into();
        it.src = format!("input://{media}/{}", new_id());
        it.looped = false;
        it.extra.insert("input".into(), cfg);
        g.items.push(it.clone());
        Some(it)
    }

    pub fn add_blank(&mut self, gid: &str, name: &str) -> Option<Item> {
        let g = self.group_mut(gid)?;
        let mut it = Item::base();
        it.kind = "slide".into();
        it.label = name.to_string();
        g.items.push(it.clone());
        Some(it)
    }

    /// Hapus slide lama dengan `origin` sama, lalu tambahkan yang baru.
    pub fn replace_slides(&mut self, gid: &str, origin: &str, slides: Vec<Map<String, Value>>) -> usize {
        let Some(g) = self.group_mut(gid) else { return 0 };
        g.items.retain(|x| !(x.kind == "slide" && x.extra.get("origin").and_then(|o| o.as_str()) == Some(origin)));
        let mut n = 0;
        for s in slides {
            let mut patch = s;
            patch.insert("kind".into(), json!("slide"));
            patch.insert("origin".into(), json!(origin));
            if let Some(it) = Item::base().merged(&patch) {
                g.items.push(it);
                n += 1;
            }
        }
        n
    }

    pub fn set_tag(&mut self, gid: &str, iid: &str, tag: Option<(String, String)>) -> bool {
        let Some(it) = self.group_mut(gid).and_then(|g| g.items.iter_mut().find(|x| x.id == iid)) else {
            return false;
        };
        match tag {
            Some((name, color)) => {
                it.extra.insert("tag".into(), json!({ "name": name, "color": color }));
            }
            None => {
                it.extra.remove("tag");
            }
        }
        true
    }

    pub fn update_item(&mut self, gid: &str, iid: &str, patch: &Map<String, Value>) -> bool {
        let Some(g) = self.group_mut(gid) else { return false };
        let Some(pos) = g.items.iter().position(|x| x.id == iid) else { return false };
        match g.items[pos].merged(patch) {
            Some(new) => {
                g.items[pos] = new;
                true
            }
            None => false,
        }
    }

    /// Salin item ke grup ini. Mengembalikan (hasil, item baru).
    pub fn copy_in(&mut self, gid: &str, incoming: &Map<String, Value>) -> (Outcome, Option<Item>) {
        let Some(g) = self.group_mut(gid) else { return (Outcome::NotFound, None) };
        let Some(mut cand) = Item::base().merged(incoming) else { return (Outcome::NotFound, None) };
        if g.items.iter().any(|x| x.same(&cand)) {
            return (Outcome::Dup, None);
        }
        cand.id = new_id();
        cand.added = now_ms();
        g.items.push(cand.clone());
        (Outcome::Ok, Some(cand))
    }

    pub fn remove_item(&mut self, gid: &str, iid: &str) -> bool {
        let Some(g) = self.group_mut(gid) else { return false };
        let before = g.items.len();
        g.items.retain(|x| x.id != iid);
        g.items.len() != before
    }

    pub fn move_item(&mut self, from: &str, iid: &str, to: &str) -> Outcome {
        if from == to {
            return Outcome::NotFound;
        }
        let (Some(fi), Some(ti)) = (
            self.groups.iter().position(|g| g.id == from),
            self.groups.iter().position(|g| g.id == to),
        ) else {
            return Outcome::NotFound;
        };
        let Some(pos) = self.groups[fi].items.iter().position(|x| x.id == iid) else {
            return Outcome::NotFound;
        };
        if self.groups[ti].items.iter().any(|x| x.same(&self.groups[fi].items[pos])) {
            return Outcome::Dup;
        }
        let it = self.groups[fi].items.remove(pos);
        self.groups[ti].items.push(it);
        Outcome::Ok
    }

    pub fn sort_group(&mut self, gid: &str, by: &str, desc: bool) -> bool {
        if !matches!(by, "name" | "kind" | "added") {
            return false;
        }
        let Some(g) = self.group_mut(gid) else { return false };
        let by_name = |a: &Item, b: &Item| natord::compare_ignore_case(&a.name(), &b.name());
        g.items.sort_by(|a, b| {
            let o = match by {
                "kind" => natord::compare_ignore_case(&a.kind, &b.kind).then_with(|| by_name(a, b)),
                "added" => a.added.cmp(&b.added).then_with(|| by_name(a, b)),
                _ => by_name(a, b),
            };
            if desc { o.reverse() } else { o }
        });
        true
    }

    /// Cari grup menurut nama, buat bila belum ada. Mengembalikan (id, dibuat?).
    pub fn ensure_group(&mut self, name: &str) -> (String, bool) {
        if let Some(g) = self.groups.iter().find(|g| g.name == name) {
            return (g.id.clone(), false);
        }
        (self.create_group(name).id, true)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn store_with_group() -> (Store, String) {
        let mut s = Store::default();
        let g = s.create_group("A");
        (s, g.id)
    }

    #[test]
    fn add_files_skips_dups_and_unknown() {
        let (mut s, gid) = store_with_group();
        let paths = vec!["C:\\a\\x.MP4".to_string(), "C:\\a\\x.MP4".into(), "doc.txt".into()];
        assert_eq!(s.add_files(&gid, &paths, false), 1); // dup dan .txt dilewati
        assert_eq!(s.add_files(&gid, &["doc.txt".to_string()], true), 1); // library: jadi "file"
    }

    #[test]
    fn move_item_detects_dup() {
        let (mut s, a) = store_with_group();
        let b = s.create_group("B").id;
        s.add_files(&a, &["x.png".to_string()], true);
        s.add_files(&b, &["x.png".to_string()], true);
        let iid = s.groups[0].items[0].id.clone();
        assert_eq!(s.move_item(&a, &iid, &b), Outcome::Dup);
    }

    #[test]
    fn sort_is_natural_and_desc_reverses() {
        let (mut s, gid) = store_with_group();
        let p: Vec<String> = ["f10.png", "f2.png", "F1.png"].iter().map(|x| x.to_string()).collect();
        s.add_files(&gid, &p, true);
        s.sort_group(&gid, "name", false);
        let names: Vec<_> = s.groups[0].items.iter().map(|i| i.name()).collect();
        assert_eq!(names, ["F1.png", "f2.png", "f10.png"]);
        s.sort_group(&gid, "name", true);
        assert_eq!(s.groups[0].items[0].name(), "f10.png");
    }

    #[test]
    fn replace_slides_replaces_same_origin_and_keeps_tag() {
        let (mut s, gid) = store_with_group();
        let mk = |label: &str| -> Map<String, Value> {
            json!({ "label": label, "tag": { "name": "Verse 1", "color": "#43a047" }, "slide": { "layers": [] } })
                .as_object().unwrap().clone()
        };
        s.replace_slides(&gid, "bundle", vec![mk("a"), mk("b")]);
        s.replace_slides(&gid, "bundle", vec![mk("c")]);
        let items = &s.groups[0].items;
        assert_eq!(items.len(), 1);
        assert_eq!(items[0].label, "c");
        assert_eq!(items[0].extra["tag"]["name"], "Verse 1");
        assert_eq!(items[0].extra["origin"], "bundle");
    }

    #[test]
    fn update_and_tag_and_copy_in() {
        let (mut s, gid) = store_with_group();
        let it = s.add_blank(&gid, "Kosong").unwrap();
        let patch = json!({ "slide": { "content": "hai" } }).as_object().unwrap().clone();
        assert!(s.update_item(&gid, &it.id, &patch));
        assert_eq!(s.groups[0].items[0].extra["slide"]["content"], "hai");
        assert!(s.set_tag(&gid, &it.id, Some(("Chorus".into(), "#d32f2f".into()))));
        assert!(s.set_tag(&gid, &it.id, None));
        assert!(!s.groups[0].items[0].extra.contains_key("tag"));

        let inc = json!({ "kind": "image", "src": "p.png" }).as_object().unwrap().clone();
        assert_eq!(s.copy_in(&gid, &inc).0, Outcome::Ok);
        assert_eq!(s.copy_in(&gid, &inc).0, Outcome::Dup);
    }

    #[test]
    fn ensure_group_reuses_name() {
        let mut s = Store::default();
        let (id1, c1) = s.ensure_group("Bundle");
        let (id2, c2) = s.ensure_group("Bundle");
        assert!(c1 && !c2 && id1 == id2);
    }
}