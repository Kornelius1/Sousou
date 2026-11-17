fn main() {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR tidak ditemukan");
    prost_build::Config::new()
        .file_descriptor_set_path(format!("{out_dir}/custom_descriptors.bin"))
        .compile_protos(&["src/pro_parser/schema.proto"], &["src/pro_parser/"])
        .expect("Gagal mengompilasi schema.proto");

    tauri_build::build();
}
