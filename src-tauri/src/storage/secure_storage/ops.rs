use rand::RngCore;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard, OnceLock};

pub const FILE_NAME: &str = "secure-storage-v1.bin";
pub const MAGIC: &[u8] = b"QSF1";
pub const FORMAT_VERSION: u8 = 1;
pub const KEY_LENGTH: usize = 32;
pub const NONCE_LENGTH: usize = 12;

pub const SENSITIVE_KEYS: &[&str] = &[
    "antigravity-accounts-list",
    "antigravity-codex-accounts",
    "quotashift_local_antigravity_session_v1",
];

static SECURE_STORAGE_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub fn secure_storage_lock() -> Result<MutexGuard<'static, ()>, String> {
    SECURE_STORAGE_LOCK
        .get_or_init(|| Mutex::new(()))
        .lock()
        .map_err(|_| "secure storage lock is poisoned".to_string())
}

pub fn is_sensitive_key(key: &str) -> bool {
    SENSITIVE_KEYS.contains(&key) || (key.starts_with("antigravity-") && key.ends_with("-accounts"))
}

pub fn validate_key(key: Vec<u8>) -> Result<Vec<u8>, String> {
    if key.len() != KEY_LENGTH {
        return Err(format!(
            "secure storage key has invalid length {}; expected {KEY_LENGTH}",
            key.len()
        ));
    }
    Ok(key)
}

pub fn associated_data() -> [u8; MAGIC.len() + 1] {
    let mut aad = [0u8; MAGIC.len() + 1];
    aad[..MAGIC.len()].copy_from_slice(MAGIC);
    aad[MAGIC.len()] = FORMAT_VERSION;
    aad
}

pub fn set_mode_0700(directory: &Path) -> Result<(), String> {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(directory, std::fs::Permissions::from_mode(0o700))
            .map_err(|error| format!("secure storage directory permissions: {error}"))?;
    }
    let _ = directory;
    Ok(())
}

pub fn temporary_path(path: &Path) -> PathBuf {
    let mut random = [0u8; 12];
    rand::rngs::OsRng.fill_bytes(&mut random);
    let suffix = random
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(FILE_NAME);
    path.with_file_name(format!(".{file_name}.tmp-{}-{suffix}", std::process::id()))
}

pub fn validate_requested_key(key: &str) -> Result<(), String> {
    if is_sensitive_key(key) {
        Ok(())
    } else {
        Err(format!(
            "secure storage key is not sensitive account data: {key}"
        ))
    }
}
