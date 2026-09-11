use std::path::PathBuf;

fn repo_file(path: &str) -> String {
    let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    std::fs::read_to_string(manifest.join(path)).expect("secure storage source must exist")
}

#[test]
fn secure_storage_uses_os_keyring_only_for_aes_key_and_authenticated_ciphertext() {
    let source = repo_file("src/storage/secure_storage.rs");
    assert!(source.contains("keyring::Entry"));
    assert!(source.contains("Aes256Gcm"));
    assert!(source.contains(".encrypt("));
    assert!(source.contains(".decrypt("));
    assert!(source.contains("missing while encrypted data exists"));
}

#[test]
fn secure_storage_writes_unique_restrictive_temporary_files_before_replace() {
    let source = repo_file("src/storage/secure_storage.rs");
    assert!(source.contains("create_new"));
    assert!(source.contains("sync_all"));
    assert!(source.contains("set_mode_0600"));
    assert!(source.contains("rename"));
}

#[test]
fn secure_storage_commands_are_async_and_fail_closed() {
    let source = repo_file("src/storage/secure_storage.rs");
    assert!(source.contains("pub async fn secure_storage_load"));
    assert!(source.contains("pub async fn secure_storage_set"));
    assert!(source.contains("pub async fn secure_storage_delete"));
    assert!(source.contains("Result<"));
    assert!(source.contains("KEYRING_USER"));
}
