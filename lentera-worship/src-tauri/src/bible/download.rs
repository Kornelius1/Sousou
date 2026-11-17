use std::{path::Path, time::Duration};

/// Daftar sumber resmi. Frontend hanya mengirim id, bukan URL,
/// supaya aplikasi tidak bisa disuruh mengunduh dari alamat sembarang.
const SOURCES: &[(&str, &str)] = &[
    ("tsi", "https://ebible.org/Scriptures/ind_usfm.zip"),
    ("bfa", "https://ebible.org/Scriptures/indags_usfm.zip"),
    ("bsb", "https://ebible.org/Scriptures/engbsb_usfm.zip"),
    ("web", "https://ebible.org/Scriptures/engwebp_usfm.zip"),
];

pub fn source_url(id: &str) -> Option<&'static str> {
    SOURCES.iter().find(|(k, _)| *k == id).map(|(_, u)| *u)
}

/// Unduh `url` ke `dest`. Menolak respons non-2xx dan berkas yang bukan zip.
pub async fn fetch_zip(url: &str, dest: &Path) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .user_agent("LenteraWorship/0.1.0")
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Koneksi gagal: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Server menolak: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("Unduhan terputus: {e}"))?;
    if bytes.len() < 4 || &bytes[..4] != b"PK\x03\x04" {
        return Err("Berkas yang diunduh bukan zip".into());
    }
    std::fs::write(dest, &bytes).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use httpmock::prelude::*;

    fn tmp(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!("pc_dl_{}_{name}", std::process::id()))
    }

    #[test]
    fn source_url_known_and_unknown() {
        assert!(source_url("bsb").unwrap().ends_with("engbsb_usfm.zip"));
        assert!(source_url("tidak-ada").is_none());
    }

    #[tokio::test]
    async fn downloads_valid_zip() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.method(GET).path("/x.zip");
                then.status(200).body(b"PK\x03\x04isi-zip");
            })
            .await;
        let dest = tmp("ok.zip");
        fetch_zip(&server.url("/x.zip"), &dest).await.unwrap();
        assert!(dest.exists());
        let _ = std::fs::remove_file(&dest);
    }

    #[tokio::test]
    async fn rejects_non_zip() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.method(GET).path("/x.zip");
                then.status(200).body("<html>error</html>");
            })
            .await;
        let dest = tmp("bad.zip");
        assert!(fetch_zip(&server.url("/x.zip"), &dest).await.is_err());
        assert!(!dest.exists(), "berkas tidak boleh ditulis kalau bukan zip");
    }

    #[tokio::test]
    async fn rejects_404() {
        let server = MockServer::start_async().await;
        server
            .mock_async(|when, then| {
                when.path("/x.zip");
                then.status(404);
            })
            .await;
        let dest = tmp("404.zip");
        assert!(fetch_zip(&server.url("/x.zip"), &dest).await.is_err());
    }

    /// Butuh internet. Jalankan: cargo test -- --ignored
    #[tokio::test]
    #[ignore]
    async fn real_download_all_sources() {
        for (id, url) in SOURCES {
            let dest = tmp(&format!("{id}.zip"));
            fetch_zip(url, &dest)
                .await
                .unwrap_or_else(|e| panic!("{id}: {e}"));
            assert!(std::fs::metadata(&dest).unwrap().len() > 100_000, "{id} terlalu kecil");
            let _ = std::fs::remove_file(&dest);
        }
    }
}