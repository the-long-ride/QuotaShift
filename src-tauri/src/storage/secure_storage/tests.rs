use super::*;
use std::sync::Mutex;

struct TempDirectory {
    path: PathBuf,
}

impl TempDirectory {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "quotashift-secure-storage-test-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir_all(&path).unwrap();
        Self { path }
    }
}

impl Drop for TempDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

struct FakeVault {
    key: Mutex<Option<Vec<u8>>>,
}

impl FakeVault {
    fn empty() -> Self {
        Self {
            key: Mutex::new(None),
        }
    }
}

impl KeyVault for FakeVault {
    fn load_key(&self) -> Result<Option<Vec<u8>>, String> {
        Ok(self.key.lock().unwrap().clone())
    }

    fn store_key(&self, key: &[u8]) -> Result<(), String> {
        *self.key.lock().unwrap() = Some(key.to_vec());
        Ok(())
    }
}

#[test]
fn authenticated_file_round_trip_keeps_credentials_out_of_ciphertext() {
    let directory = TempDirectory::new();
    let path = directory.path.join(FILE_NAME);
    let vault = FakeVault::empty();
    let mut values = BTreeMap::new();
    values.insert(
        "antigravity-accounts-list".to_string(),
        "synthetic-token".to_string(),
    );

    write_values(&path, &values, &vault).unwrap();
    let ciphertext = fs::read(&path).unwrap();
    assert!(!String::from_utf8_lossy(&ciphertext).contains("synthetic-token"));
    assert_eq!(read_values(&path, &vault).unwrap(), values);
}

#[test]
fn missing_key_with_existing_ciphertext_fails_closed() {
    let directory = TempDirectory::new();
    let path = directory.path.join(FILE_NAME);
    let writer = FakeVault::empty();
    let mut values = BTreeMap::new();
    values.insert(
        "antigravity-codex-accounts".to_string(),
        "synthetic-oauth".to_string(),
    );
    write_values(&path, &values, &writer).unwrap();

    let reader = FakeVault::empty();
    let error = read_values(&path, &reader).unwrap_err();
    assert!(error.contains("missing while encrypted data exists"));
}

#[test]
fn tampering_is_rejected_without_returning_partial_account_data() {
    let directory = TempDirectory::new();
    let path = directory.path.join(FILE_NAME);
    let vault = FakeVault::empty();
    let mut values = BTreeMap::new();
    values.insert(
        "quotashift_local_antigravity_session_v1".to_string(),
        "synthetic-session".to_string(),
    );
    write_values(&path, &values, &vault).unwrap();
    let mut bytes = fs::read(&path).unwrap();
    *bytes.last_mut().unwrap() ^= 0x01;
    fs::write(&path, bytes).unwrap();

    let error = read_values(&path, &vault).unwrap_err();
    assert!(error.contains("authentication failed"));
}

#[test]
fn existing_ciphertext_is_retained_when_keyring_write_cannot_proceed() {
    let directory = TempDirectory::new();
    let path = directory.path.join(FILE_NAME);
    let writer = FakeVault::empty();
    let mut values = BTreeMap::new();
    values.insert(
        "antigravity-imported-accounts".to_string(),
        "synthetic-import".to_string(),
    );
    write_values(&path, &values, &writer).unwrap();
    let previous = fs::read(&path).unwrap();

    let missing_key = FakeVault::empty();
    let error = write_values(&path, &BTreeMap::new(), &missing_key).unwrap_err();
    assert!(error.contains("missing while encrypted data exists"));
    assert_eq!(fs::read(&path).unwrap(), previous);
}

#[test]
fn process_lock_serializes_command_critical_sections() {
    let guard = secure_storage_lock().unwrap();
    let (sender, receiver) = std::sync::mpsc::channel();
    let worker = std::thread::spawn(move || {
        let _worker_guard = secure_storage_lock().unwrap();
        sender.send(()).unwrap();
    });
    assert!(receiver
        .recv_timeout(std::time::Duration::from_millis(25))
        .is_err());
    drop(guard);
    receiver
        .recv_timeout(std::time::Duration::from_secs(1))
        .unwrap();
    worker.join().unwrap();
}
