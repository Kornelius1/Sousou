fn main() {
    let out_dir = std::env::var("OUT_DIR").expect("OUT_DIR tidak ditemukan");
    let protoc = protoc_bin_vendored::protoc_bin_path()
        .expect("protoc vendored tidak ditemukan");

    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc);
    config.file_descriptor_set_path(format!("{out_dir}/custom_descriptors.bin"));
    config
        .compile_protos(&["src/pro_parser/schema.proto"], &["src/pro_parser/"])
        .expect("Gagal mengompilasi schema.proto");

    tauri_build::build();
}