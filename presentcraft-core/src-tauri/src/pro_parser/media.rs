//! Penentuan lokasi file media di disk.
//!
//! Path di dalam .pro adalah path komputer pembuatnya (mis. "Media/Assets/x.mov"),
//! sedangkan struktur folder pengguna bisa berbeda. Urutan pencarian:
//!   1. path persis di bawah root,
//!   2. pencarian berdasarkan nama file (tanpa membedakan huruf besar/kecil)
//!      di dalam root, maksimal `MAX_DEPTH` tingkat.
//!
//! Indeks nama file dibuat SEKALI dan hanya saat pertama kali dibutuhkan,
//! lalu dipakai ulang untuk semua media pada file yang sama.

use std::cell::OnceCell;
use std::collections::{HashMap, VecDeque};
use std::path::{Component, Path, PathBuf};

const MAX_DEPTH: u32 = 4;

/// Tolak path absolut / berisi `..` agar file .pro jahat tidak keluar dari root.
pub(super) fn safe_relative(rel: &str) -> bool {
    let p = Path::new(rel);
    !p.has_root()
        && p.components()
            .all(|c| matches!(c, Component::Normal(_) | Component::CurDir))
}

fn build_index(root: &Path, max_depth: u32, out: &mut HashMap<String, PathBuf>) {
    let mut queue = VecDeque::from([(root.to_path_buf(), max_depth)]);
    while let Some((dir, depth)) = queue.pop_front() {
        if depth == 0 {
            continue;
        }
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        let mut entries: Vec<_> = rd.flatten().map(|e| e.path()).collect();
        entries.sort(); // deterministik antar-OS
        for p in entries {
            if p.is_dir() {
                queue.push_back((p, depth - 1));
            } else if let Some(n) = p.file_name() {
                out.entry(n.to_string_lossy().to_lowercase()).or_insert(p);
            }
        }
    }
}

pub struct MediaResolver {
    root: PathBuf,
    index: OnceCell<HashMap<String, PathBuf>>,
}

impl MediaResolver {
    pub fn new(root: &Path) -> Self {
        Self {
            root: root.to_path_buf(),
            index: OnceCell::new(),
        }
    }

    fn index(&self) -> &HashMap<String, PathBuf> {
        self.index.get_or_init(|| {
            let mut m = HashMap::new();
            build_index(&self.root, MAX_DEPTH, &mut m);
            m
        })
    }

    /// Mengembalikan (path, ditemukan?). Bila tidak ditemukan, path-nya
    /// adalah tebakan `root/rel` agar pesan error tetap informatif.
    pub fn resolve(&self, rel: &str) -> (PathBuf, bool) {
        let primary = self.root.join(rel);
        if primary.exists() {
            return (primary, true);
        }
        if let Some(name) = Path::new(rel).file_name() {
            let key = name.to_string_lossy().to_lowercase();
            if let Some(p) = self.index().get(&key) {
                return (p.clone(), true);
            }
        }
        (primary, false)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unsafe_paths() {
        assert!(safe_relative("Media/Assets/a.mov"));
        assert!(!safe_relative("../x.mov"));
        assert!(!safe_relative("/etc/passwd"));
    }

    #[test]
    fn resolves_media_by_filename() {
        let root = std::env::temp_dir().join("pc_resolve_test");
        let _ = std::fs::remove_dir_all(&root);
        std::fs::create_dir_all(root.join("Media")).unwrap();
        std::fs::write(root.join("Media/clip.mov"), b"x").unwrap();

        let r = MediaResolver::new(&root);
        let (p, ok) = r.resolve("Media/Assets/CLIP.mov");
        assert!(ok);
        assert!(p.ends_with("Media/clip.mov") || p.ends_with("Media\\clip.mov"));

        let (_, found) = r.resolve("Media/Assets/none.mov");
        assert!(!found);
    }
}