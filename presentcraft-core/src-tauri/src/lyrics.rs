// Lyrics service: provider selection, user key storage, Musixmatch client.
// The key never leaves Rust: the frontend only learns whether a service is configured.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{fs, path::PathBuf, time::Duration};
use tauri::Manager;

const FILE: &str = "lyrics_settings.json";
const MXM: &str = "https://api.musixmatch.com/ws/1.1";

/// How the app authenticates. `Proxy` is reserved for a future server you own (no key on the client).
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(tag = "mode", rename_all = "lowercase")]
enum Auth {
    #[default]
    None,
    UserKey { key: String },
    Proxy { base_url: String },
}

#[derive(Serialize, Deserialize, Default)]
struct Settings {
    #[serde(default)]
    auth: Auth,
}

fn path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_data_dir().map_err(|e| e.to_string())?.join(FILE))
}

fn load(app: &tauri::AppHandle) -> Settings {
    path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

fn save(app: &tauri::AppHandle, s: &Settings) -> Result<(), String> {
    let p = path(app)?;
    if let Some(dir) = p.parent() {
        fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string_pretty(s).map_err(|e| e.to_string())?;
    fs::write(p, json).map_err(|e| e.to_string())
}

fn key_of(app: &tauri::AppHandle) -> Result<String, String> {
    match load(app).auth {
        Auth::UserKey { key } if !key.trim().is_empty() => Ok(key),
        Auth::Proxy { .. } => Err("Proxy mode is not implemented yet.".into()),
        _ => Err("Lyrics service is not configured.".into()),
    }
}

/// GET a Musixmatch method; returns `message.body`. Errors never include the URL (it contains the key).
async fn mxm(key: &str, method: &str, params: &[(&str, &str)]) -> Result<Value, String> {
    let err = |e: reqwest::Error| e.without_url().to_string();
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(err)?;
    let mut q: Vec<(&str, &str)> = params.to_vec();
    q.push(("apikey", key));
    let v: Value = client
        .get(format!("{MXM}/{method}"))
        .query(&q)
        .send()
        .await
        .map_err(err)?
        .json()
        .await
        .map_err(err)?;
    match v["message"]["header"]["status_code"].as_i64().unwrap_or(0) {
        200 => Ok(v["message"]["body"].clone()),
        402 => Err("Usage limit reached for this plan.".into()),
        code => Err(format!("Musixmatch returned status {code}.")),
    }
}

#[derive(Serialize)]
pub struct TrackHit {
    id: i64,
    title: String,
    artist: String,
    album: String,
}

#[derive(Serialize)]
pub struct LyricsDoc {
    text: String,
    copyright: String,
    language: String,
    tracking_url: String,
}

/// True when a lyrics service is configured (lets the UI hide the feature otherwise).
#[tauri::command]
pub fn lyrics_status(app: tauri::AppHandle) -> bool {
    key_of(&app).is_ok()
}

/// Save (or clear, if empty) the user's key. Returns whether a service is now configured.
#[tauri::command]
pub fn lyrics_set_key(app: tauri::AppHandle, key: String) -> Result<bool, String> {
    let key = key.trim().to_string();
    let configured = !key.is_empty();
    let auth = if configured { Auth::UserKey { key } } else { Auth::None };
    save(&app, &Settings { auth })?;
    Ok(configured)
}

/// Cheap request to check that the saved key works.
#[tauri::command]
pub async fn lyrics_test(app: tauri::AppHandle) -> Result<bool, String> {
    let key = key_of(&app)?;
    mxm(&key, "track.search", &[("q", "a"), ("page_size", "1")]).await?;
    Ok(true)
}

#[tauri::command]
pub async fn lyrics_search(app: tauri::AppHandle, query: String) -> Result<Vec<TrackHit>, String> {
    let key = key_of(&app)?;
    let q = query.trim();
    if q.is_empty() {
        return Ok(vec![]);
    }
    let body = mxm(&key, "track.search", &[("q", q), ("page_size", "10"), ("f_has_lyrics", "1")]).await?;
    let list = body["track_list"]
        .as_array()
        .ok_or("Unexpected response from the lyrics service.")?;
    Ok(list
        .iter()
        .filter_map(|t| {
            let t = &t["track"];
            Some(TrackHit {
                id: t["track_id"].as_i64()?,
                title: t["track_name"].as_str()?.into(),
                artist: t["artist_name"].as_str().unwrap_or("").into(),
                album: t["album_name"].as_str().unwrap_or("").into(),
            })
        })
        .collect())
}

#[tauri::command]
pub async fn lyrics_get(app: tauri::AppHandle, track_id: i64) -> Result<LyricsDoc, String> {
    let key = key_of(&app)?;
    let id = track_id.to_string();
    let body = mxm(&key, "track.lyrics.get", &[("track_id", id.as_str())]).await?;
    let l = &body["lyrics"];
    let text = l["lyrics_body"].as_str().unwrap_or("").trim().to_string();
    if text.is_empty() {
        return Err("No lyrics available for this track.".into());
    }
    Ok(LyricsDoc {
        text,
        copyright: l["lyrics_copyright"].as_str().unwrap_or("").into(),
        language: l["lyrics_language"].as_str().unwrap_or("").into(),
        tracking_url: l["pixel_tracking_url"].as_str().unwrap_or("").into(),
        script_tracking_url: l["script_tracking_url"].as_str().unwrap_or("").into(),
        backlink_url: l["backlink_url"].as_str().unwrap_or("").into(),
        allowed: list(&l["region_restriction"]["allowed"]),
        blocked: list(&l["region_restriction"]["blocked"]),
    })
}

#[derive(Serialize)]
pub struct LyricsDoc {
    text: String,
    copyright: String,
    language: String,
    tracking_url: String,        // pixel_tracking_url
    script_tracking_url: String,
    backlink_url: String,
    allowed: Vec<String>,        // region_restriction.allowed
    blocked: Vec<String>,        // region_restriction.blocked
}