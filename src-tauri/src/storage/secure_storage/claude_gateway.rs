use super::*;
use crate::codex::router::ClientBinding;

// Native-only encrypted store for Claude gateway bindings. Never exposed as Tauri commands.
// Same at-rest protection as the SIWC store: AES-GCM file keyed by the OS key vault.

const STORE_FILE: &str = "claude-gateway-v1.bin";
pub(crate) const BINDING_KEY_PREFIX: &str = "claude-gateway-binding-";
const TAURI_CONFIG: &str = include_str!("../../../tauri.conf.json");

fn bundle_identifier() -> Result<String, String> {
    let config: serde_json::Value =
        serde_json::from_str(TAURI_CONFIG).map_err(|_| "tauri config is invalid".to_string())?;
    match config.get("identifier").and_then(|v| v.as_str()) {
        Some(id) if !id.is_empty() => Ok(id.to_string()),
        _ => Err("tauri config has no bundle identifier".into()),
    }
}

fn data_root() -> Result<PathBuf, String> {
    dirs::data_dir().ok_or_else(|| "platform data directory is unavailable".to_string())
}

/// Same directory Tauri's `app_data_dir()` resolves, computed without an `AppHandle`.
pub(crate) fn gateway_store_path() -> Result<PathBuf, String> {
    store_path_under(data_root()?)
}

fn store_path_under(root: PathBuf) -> Result<PathBuf, String> {
    Ok(root.join(bundle_identifier()?).join(STORE_FILE))
}

fn binding_key(binding_id: &str) -> Result<String, String> {
    if binding_id.is_empty()
        || binding_id.len() > 128
        || !binding_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid Claude gateway binding reference".into());
    }
    Ok(format!("{BINDING_KEY_PREFIX}{binding_id}"))
}

fn load_in(path: &Path, vault: &impl KeyVault) -> Result<Vec<ClientBinding>, String> {
    let values = read_values(path, vault)?;
    values
        .iter()
        .filter(|(key, _)| key.starts_with(BINDING_KEY_PREFIX))
        .map(|(_, json)| {
            serde_json::from_str(json)
                .map_err(|_| "Stored Claude gateway binding is corrupt".into())
        })
        .collect()
}

fn save_in(path: &Path, vault: &impl KeyVault, binding: &ClientBinding) -> Result<(), String> {
    let key = binding_key(&binding.id.0)?;
    let json = serde_json::to_string(binding)
        .map_err(|_| "Claude gateway binding encoding failed".to_string())?;
    let mut values = read_values(path, vault)?;
    values.insert(key, json);
    write_values(path, &values, vault)
}

fn delete_in(path: &Path, vault: &impl KeyVault, binding_id: &str) -> Result<(), String> {
    let key = binding_key(binding_id)?;
    let mut values = read_values(path, vault)?;
    if values.remove(&key).is_some() {
        write_values(path, &values, vault)?;
    }
    Ok(())
}

/// Newest non-revoked binding secret for the profile; revoked or absent -> `None`.
fn secret_in(
    path: &Path,
    vault: &impl KeyVault,
    profile_id: &str,
) -> Result<Option<String>, String> {
    Ok(load_in(path, vault)?
        .into_iter()
        .filter(|b| b.profile_id == profile_id && !b.revoked)
        .max_by_key(|b| b.created_at)
        .map(|b| b.secret))
}

pub(crate) fn save_gateway_binding(binding: &ClientBinding) -> Result<(), String> {
    let path = gateway_store_path()?;
    let _guard = secure_storage_lock()?;
    save_in(&path, &OsKeyVault, binding)
}

pub(crate) fn load_gateway_bindings() -> Result<Vec<ClientBinding>, String> {
    let path = gateway_store_path()?;
    let _guard = secure_storage_lock()?;
    load_in(&path, &OsKeyVault)
}

pub(crate) fn delete_gateway_binding(binding_id: &str) -> Result<(), String> {
    let path = gateway_store_path()?;
    let _guard = secure_storage_lock()?;
    delete_in(&path, &OsKeyVault, binding_id)
}

pub(crate) fn gateway_secret_for_profile(profile_id: &str) -> Result<Option<String>, String> {
    let path = gateway_store_path()?;
    let _guard = secure_storage_lock()?;
    secret_in(&path, &OsKeyVault, profile_id)
}

/// `--claude-gateway-token <profile_id>` (apiKeyHelper contract): prints the secret and
/// returns 0; prints nothing and returns 1 when absent or revoked.
pub fn run_claude_gateway_token_cli(profile_id: &str) -> i32 {
    match gateway_secret_for_profile(profile_id) {
        Ok(Some(secret)) => match writeln!(std::io::stdout().lock(), "{secret}") {
            Ok(()) => 0,
            Err(_) => 1,
        },
        Ok(None) => 1,
        Err(error) => {
            eprintln!("QuotaShift Claude gateway token: {error}");
            1
        }
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashSet;
    use std::sync::Mutex;

    struct TempDirectory {
        path: PathBuf,
    }

    impl TempDirectory {
        fn new() -> Self {
            let path = std::env::temp_dir().join(format!(
                "quotashift-claude-gateway-test-{}-{}",
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

    struct FakeVault(Mutex<Option<Vec<u8>>>);

    impl KeyVault for FakeVault {
        fn load_key(&self) -> Result<Option<Vec<u8>>, String> {
            Ok(self.0.lock().unwrap().clone())
        }

        fn store_key(&self, key: &[u8]) -> Result<(), String> {
            *self.0.lock().unwrap() = Some(key.to_vec());
            Ok(())
        }
    }

    fn sample(profile: &str, secret: &str) -> ClientBinding {
        let mut b = ClientBinding::with_secret(
            profile.into(),
            Some("claude-native".into()),
            secret.into(),
            HashSet::from(["alias-one".to_string()]),
        );
        b.fallback_alias = Some("alias-one".into());
        b
    }

    #[test]
    fn binding_round_trips_through_store() {
        let dir = TempDirectory::new();
        let path = dir.path.join("claude-gateway-v1.bin");
        let vault = FakeVault(Mutex::new(None));
        let b = sample("profile-a", "test-gateway-value");
        save_in(&path, &vault, &b).unwrap();
        let loaded = load_in(&path, &vault).unwrap();
        assert_eq!(loaded, vec![b.clone()]);
        assert_eq!(loaded[0].fallback_alias.as_deref(), Some("alias-one"));
        let raw = std::fs::read(&path).unwrap();
        assert!(!raw.windows(18).any(|w| w == b"test-gateway-value"));
        assert_eq!(
            secret_in(&path, &vault, "profile-a").unwrap().as_deref(),
            Some("test-gateway-value")
        );
        delete_in(&path, &vault, &b.id.0).unwrap();
        assert!(load_in(&path, &vault).unwrap().is_empty());
    }

    #[test]
    fn revoked_binding_has_no_secret() {
        let dir = TempDirectory::new();
        let path = dir.path.join("claude-gateway-v1.bin");
        let vault = FakeVault(Mutex::new(None));
        let mut b = sample("profile-a", "test-gateway-value");
        b.revoke();
        save_in(&path, &vault, &b).unwrap();
        assert_eq!(secret_in(&path, &vault, "profile-a").unwrap(), None);
        assert_eq!(secret_in(&path, &vault, "missing").unwrap(), None);
    }

    #[test]
    fn store_path_uses_bundle_identifier() {
        let path = store_path_under(PathBuf::from("data-root")).unwrap();
        let text = path.to_string_lossy();
        assert!(text.contains("com.thelongride.quotashift"));
        assert!(text.ends_with("claude-gateway-v1.bin"));
    }

    #[test]
    fn invalid_binding_id_is_rejected() {
        let dir = TempDirectory::new();
        let path = dir.path.join("claude-gateway-v1.bin");
        let vault = FakeVault(Mutex::new(None));
        let mut b = sample("profile-a", "test-gateway-value");
        b.id.0 = "bad id/..".into();
        assert!(save_in(&path, &vault, &b).is_err());
    }
}
