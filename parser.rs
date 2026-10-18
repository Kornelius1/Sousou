use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::BufReader;

#[derive(Serialize, Deserialize, Debug)]
pub struct Slide {
    pub slide_number: usize,
    pub section: String,
    pub content: String,
}

// Fungsi inti untuk membaca file JSON hasil ekstraksi (atau langsung parsing biner nantinya)
pub fn load_slides_from_json(path: &str) -> Result<Vec<Slide>, Box<dyn std::error::Error>> {
    let file = File::open(path)?;
    let reader = BufReader::new(file);
    let slides: Vec<Slide> = serde_json::from_reader(reader)?;
    Ok(slides)
}

fn main() {
    println!("=== PresentCraft Core Engine (Rust) ===");
    
    // Uji coba memuat file JSON yang sebelumnya kita buat
    match load_slides_from_json("output_structured_slides.json") {
        Ok(slides) => {
            println!("Berhasil memuat {} slide menggunakan Rust Engine!", slides.len());
            if let Some(first_slide) = slides.first() {
                println!("Contoh Slide Pertama: [{}] {}", first_slide.section, first_slide.content);
            }
        }
        Err(e) => eprintln!("Gagal memuat slide: {}", e),
    }
}