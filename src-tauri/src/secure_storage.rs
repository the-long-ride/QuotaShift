use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use rand::RngCore;
use std::collections::BTreeMap;
use std::fs::{self, File, OpenOptions};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

const KEYRING_SERVICE: &str = "com.the-long-ride.quotashift";
const KEYRING_USER: &str = "secure-storage-key-v1";
const FILE_NAME: &str = "secure-storage-v1.bin";
const MAGIC: &[u8] = b"QSF1";
const FORMAT_VERSION: u8 = 1;
const KEY_LENGTH: usize = 32;
const NONCE_LENGTH: usize = 12;

const SENSITIVE_KEYS: &[&str] = &[
    "antigravity-accounts-list",
    "antigravity-codex-accounts",
    "quotashift_local_antigravity_session_v1",
];

static SECURE_STORAGE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

fn secure_storage_lock() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    SECURE_STORAGE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "secure storage lock is poisoned".to_string())
}

fn is_sensitive_key(key: &str) -> bool {
    SENSITIVE_KEYS.contains(&key)
        || (key.starts_with("antigravity-") && key.ends_with("-accounts"))
}

pub(crate) trait KeyVault: Send + Sync {
    fn load_key(&self) -> Result<Option<Vec<u8>>, String>;
    fn store_key(&self, key: &[u8]) -> Result<(), String>;
}

struct OsKeyVault;

impl KeyVault for OsKeyVault {
    fn load_key(&self) -> Result<Option<Vec<u8>>, String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| format!("secure storage key entry: {error}"))?;
        match entry.get_password() {
            Ok(value) => BASE64
                .decode(value)
                .map(Some)
                .map_err(|error| format!("secure storage key decode: {error}")),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(error) => Err(format!("secure storage key read: {error}")),
        }
    }

    fn store_key(&self, key: &[u8]) -> Result<(), String> {
        let entry = keyring::Entry::new(KEYRING_SERVICE, KEYRING_USER)
            .map_err(|error| format!("secure storage key entry: {error}"))?;
        entry
            .set_password(&BASE64.encode(key))
            .map_err(|error| format!("secure storage key write: {error}"))
    }
}

fn validate_key(key: Vec<u8>) -> Result<Vec<u8>, String> {
    if key.len() != KEY_LENGTH {
        return Err(format!(
            "secure storage key has invalid length {}; expected {KEY_LENGTH}",
            key.len()
        ));
    }
    Ok(key)
}

fn associated_data() -> [u8; MAGIC.len() + 1] {
    let mut aad = [0u8; MAGIC.len() + 1];
    aad[..MAGIC.len()].copy_from_slice(MAGIC);
    aad[MAGIC.len()] = FORMAT_VERSION;
    aad
}

fn encrypt_values(values: &BTreeMap<String, String>, key: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|error| format!("secure storage cipher: {error}"))?;
    let mut nonce_bytes = [0u8; NONCE_LENGTH];
    rand::rngs::OsRng.fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let plaintext = serde_json::to_vec(values)
        .map_err(|error| format!("secure storage serialization: {error}"))?;
    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: &plaintext,
                aad: &associated_data(),
            },
        )
        .map_err(|_| "secure storage encryption failed".to_string())?;

    let mut output = Vec::with_capacity(MAGIC.len() + 1 + NONCE_LENGTH + ciphertext.len());
    output.extend_from_slice(MAGIC);
    output.push(FORMAT_VERSION);
    output.extend_from_slice(&nonce_bytes);
    output.extend_from_slice(&ciphertext);
    Ok(output)
}

fn decrypt_values(bytes: &[u8], key: &[u8]) -> Result<BTreeMap<String, String>, String> {
    let minimum = MAGIC.len() + 1 + NONCE_LENGTH + 16;
    if bytes.len() < minimum {
        return Err("secure storage ciphertext is truncated".to_string());
    }
    if &bytes[..MAGIC.len()] != MAGIC || bytes[MAGIC.len()] != FORMAT_VERSION {
        return Err("secure storage ciphertext has an unsupported format".to_string());
    }

    let nonce_start = MAGIC.len() + 1;
    let nonce_end = nonce_start + NONCE_LENGTH;
    let cipher = Aes256Gcm::new_from_slice(key)
        .map_err(|error| format!("secure storage cipher: {error}"))?;
    let plaintext = cipher
        .decrypt(
            Nonce::from_slice(&bytes[nonce_start..nonce_end]),
            Payload {
                msg: &bytes[nonce_end..],
                aad: &associated_data(),
            },
        )
        .map_err(|_| "secure storage authentication failed".to_string())?;
    let values: BTreeMap<String, String> = serde_json::from_slice(&plaintext)
        .map_err(|error| format!("secure storage payload is invalid: {error}"))?;
    for key in values.keys() {
        if !is_sensitive_key(key) {
            return Err(format!("secure storage contains an unsupported key: {key}"));
        }
    }
    Ok(values)
}

fn secure_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(FILE_NAME))
        .map_err(|error| format!("secure storage app data path: {error}"))
}

fn key_for_existing_file(path: &Path, vault: &impl KeyVault) -> Result<Vec<u8>, String> {
    match vault.load_key()? {
        Some(key) => validate_key(key),
        None => Err(format!(
            "secure storage key is missing while encrypted data exists at {}",
            path.display()
        )),
    }
}

fn key_for_new_file(vault: &impl KeyVault) -> Result<Vec<u8>, String> {
    if let Some(key) = vault.load_key()? {
        return validate_key(key);
    }
    let mut key = vec![0u8; KEY_LENGTH];
    rand::rngs::OsRng.fill_bytes(&mut key);
    vault.store_key(&key)?;
    Ok(key)
}

fn read_values(path: &Path, vault: &impl KeyVault) -> Result<BTreeMap<String, String>, String> {
    if !path.exists() {
        return Ok(BTreeMap::new());
    }
    let key = key_for_existing_file(path, vault)?;
    let mut bytes = Vec::new();
    File::open(path)
        .map_err(|error| format!("secure storage open: {error}"))?
        .read_to_end(&mut bytes)
        .map_err(|error| format!("secure storage read: {error}"))?;
    decrypt_values(&bytes, &key)
}

fn set_mode_0600(file: &File) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        file.set_permissions(fs::Permissions::from_mode(0o600))
            .map_err(|error| format!("secure storage file permissions: {error}"))?;
    }
    Ok(())
}

fn set_mode_0700(directory: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(directory, fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure storage directory permissions: {error}"))?;
    }
    Ok(())
}

fn temporary_path(path: &Path) -> PathBuf {
    let mut random = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix = random.iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    let file_name = path.file_name().and_then(|name| name.to_str()).unwrap_or(FILE_NAME);
    path.with_file_name(format!(".{file_name}.tmp-{}-{suffix}", std::process::id()))
}

fn write_values(path: &Path, values: &BTreeMap<String, String>, vault: &impl KeyVault) -> Result<(), String> {
    let key = if path.exists() {
        key_for_existing_file(path, vault)?
    } else {
        key_for_new_file(vault)?
    };
    let ciphertext = encrypt_values(values, &key)?;
    let directory = path
        .parent()
        .ok_or_else(|| "secure storage has no parent directory".to_string())?;
    fs::create_dir_all(directory)
        .map_err(|error| format!("secure storage directory: {error}"))?;
    set_mode_0700(directory)?;

    let temporary = temporary_path(path);
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    let mut file = match options.open(&temporary) {
        Ok(file) => file,
        Err(error) => return Err(format!("secure storage temporary file: {error}")),
    };
    if let Err(error) = set_mode_0600(&file)
        .and_then(|_| file.write_all(&ciphertext).map_err(|e| format!("secure storage temporary write: {e}")))
        .and_then(|_| file.sync_all().map_err(|e| format!("secure storage temporary sync: {e}")))
    {
        let _ = fs::remove_file(&temporary);
        return Err(error);
    }
    drop(file);

    // The old ciphertext remains in place until this complete temporary file is
    // replaced. A failed rename leaves the old file and removes only the temp.
    if let Err(error) = fs::rename(&temporary, path) {
        let _ = fs::remove_file(&temporary);
        return Err(format!("secure storage atomic replace: {error}"));
    }

    if let Ok(directory_file) = File::open(directory) {
        let _ = directory_file.sync_all();
    }
    Ok(())
}

fn validate_requested_key(key: &str) -> Result<(), String> {
    if is_sensitive_key(key) {
        Ok(())
    } else {
        Err(format!("secure storage key is not sensitive account data: {key}"))
    }
}

fn load_os(path: &Path) -> Result<BTreeMap<String, String>, String> {
    let _guard = secure_storage_lock()?;
    read_values(path, &OsKeyVault)
}

fn set_os(path: &Path, key: String, value: String) -> Result<(), String> {
    let _guard = secure_storage_lock()?;
    validate_requested_key(&key)?;
    let mut values = read_values(path, &OsKeyVault)?;
    values.insert(key, value);
    write_values(path, &values, &OsKeyVault)
}

fn delete_os(path: &Path, key: String) -> Result<(), String> {
    let _guard = secure_storage_lock()?;
    validate_requested_key(&key)?;
    let mut values = read_values(path, &OsKeyVault)?;
    if values.remove(&key).is_some() {
        write_values(path, &values, &OsKeyVault)?;
    }
    Ok(())
}

fn clear_os(path: &Path) -> Result<(), String> {
    let _guard = secure_storage_lock()?;
    write_values(path, &BTreeMap::new(), &OsKeyVault)
}

#[tauri::command]
pub async fn secure_storage_load(app: tauri::AppHandle) -> Result<BTreeMap<String, String>, String> {
    let path = secure_file_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || load_os(&path))
        .await
        .map_err(|error| format!("secure storage worker: {error}"))?
}

#[tauri::command]
pub async fn secure_storage_set(
    app: tauri::AppHandle,
    key: String,
    value: String,
) -> Result<(), String> {
    let path = secure_file_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || set_os(&path, key, value))
        .await
        .map_err(|error| format!("secure storage worker: {error}"))?
}

#[tauri::command]
pub async fn secure_storage_delete(app: tauri::AppHandle, key: String) -> Result<(), String> {
    let path = secure_file_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || delete_os(&path, key))
        .await
        .map_err(|error| format!("secure storage worker: {error}"))?
}

#[tauri::command]
pub async fn secure_storage_clear(app: tauri::AppHandle) -> Result<(), String> {
    let path = secure_file_path(&app)?;
    tauri::async_runtime::spawn_blocking(move || clear_os(&path))
        .await
        .map_err(|error| format!("secure storage worker: {error}"))?
}

#[cfg(test)]
mod tests {
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
            Self { key: Mutex::new(None) }
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
        values.insert("antigravity-accounts-list".to_string(), "synthetic-token".to_string());

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
        values.insert("antigravity-codex-accounts".to_string(), "synthetic-oauth".to_string());
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
        values.insert("quotashift_local_antigravity_session_v1".to_string(), "synthetic-session".to_string());
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
        values.insert("antigravity-imported-accounts".to_string(), "synthetic-import".to_string());
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
        assert!(receiver.recv_timeout(std::time::Duration::from_millis(25)).is_err());
        drop(guard);
        receiver.recv_timeout(std::time::Duration::from_secs(1)).unwrap();
        worker.join().unwrap();
    }
}
