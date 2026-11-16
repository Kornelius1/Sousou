// Bible engine: import translations from USFM zips (or download them), store them as local JSON,
// resolve references ("Yoh 3:16-18") and search by keyword. Everything works offline once installed.
// Layout: books.rs (book names), usfm.rs (parser + zip import), store.rs (disk), reference.rs
// (parse "John 3:16"), query.rs (passage + search), download.rs (fetch zip), commands.rs (Tauri).
// Everything except commands.rs has no Tauri dependency and is covered by tests.rs.
use serde::{Deserialize, Serialize};
#[allow(unused_imports)] // dipakai file anak lewat `use super::*`; dirapikan di langkah 11
use std::{
    collections::HashMap,
    fs,
    io::Read,
    path::{Path, PathBuf},
    sync::{Arc, Mutex, OnceLock},
};

// ---------------------------------------------------------------- data

#[derive(Serialize, Deserialize, Clone)]
pub struct Book {
    pub id: String,                 // USFM code, e.g. "JHN"
    pub chapters: Vec<Vec<String>>, // chapters[c - 1][v - 1] = verse text ("" = no such verse / bridged)
}

/// Descriptive data supplied by the caller (license and attribution travel with the text).
#[derive(Serialize, Deserialize, Clone)]
pub struct Meta {
    pub id: String,
    pub name: String,
    pub lang: String,
    pub license: String,
    pub attribution: String,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Translation {
    #[serde(flatten)]
    pub meta: Meta,
    pub books: Vec<Book>,
}

#[derive(Serialize, Deserialize, Clone)]
pub struct Info {
    #[serde(flatten)]
    pub meta: Meta,
    pub books: usize,
}

#[derive(Default)]
pub struct BibleState {
    pub cache: Mutex<HashMap<String, Arc<Translation>>>,
}

// ---------------------------------------------------------------- modules

mod books;
mod usfm;
mod store;
mod reference;
mod query;
mod download;
pub mod commands;

#[allow(unused_imports)]
use {books::*, query::*, reference::*, store::*, usfm::*};

#[cfg(test)]
mod tests;