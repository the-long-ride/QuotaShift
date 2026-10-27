use super::*;

// Native-only encrypted SIWC storage. Never exposed as Tauri commands.
pub(crate) fn siwc_credential_file(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join("siwc-credentials-v1.bin"))
        .map_err(|error| format!("SIWC secure storage app data path: {error}"))
}

pub(crate) fn load_native_siwc_secret(
    app: &tauri::AppHandle,
    registration_id: &str,
) -> Result<Option<String>, String> {
    let key = native_siwc_key(registration_id)?;
    let path = siwc_credential_file(app)?;
    let _guard = secure_storage_lock()?;
    Ok(read_values(&path, &OsKeyVault)?.remove(&key))
}

pub(crate) fn delete_native_siwc_secret(
    app: &tauri::AppHandle,
    registration_id: &str,
) -> Result<(), String> {
    let key = native_siwc_key(registration_id)?;
    let path = siwc_credential_file(app)?;
    let _guard = secure_storage_lock()?;
    let mut values = read_values(&path, &OsKeyVault)?;
    let removed = values.remove(&key).is_some();
    let mut ids: Vec<String> = match values.get(SIWC_INDEX_KEY) {
        Some(index) => {
            serde_json::from_str(index).map_err(|_| "Stored SIWC account index is corrupt")?
        }
        None => Vec::new(),
    };
    let previous_len = ids.len();
    ids.retain(|id| id != registration_id);
    if removed || ids.len() != previous_len {
        values.insert(
            SIWC_INDEX_KEY.to_string(),
            serde_json::to_string(&ids).map_err(|_| "SIWC index encoding failed")?,
        );
        write_values(&path, &values, &OsKeyVault)?;
    }
    Ok(())
}

fn native_siwc_key(registration_id: &str) -> Result<String, String> {
    if registration_id.is_empty()
        || registration_id.len() > 128
        || !registration_id
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
    {
        return Err("Invalid SIWC registration reference".into());
    }
    Ok(format!("siwc-registration-{registration_id}"))
}

const SIWC_INDEX_KEY: &str = "siwc-registration-index";

/// Atomically persist the newly validated session and its index entry.
pub(crate) fn save_native_siwc_session(
    app: &tauri::AppHandle,
    registration_id: &str,
    session_json: String,
) -> Result<(), String> {
    let key = native_siwc_key(registration_id)?;
    let path = siwc_credential_file(app)?;
    let _guard = secure_storage_lock()?;
    let mut records = read_values(&path, &OsKeyVault)?;
    let mut ids: Vec<String> = match records.get(SIWC_INDEX_KEY) {
        Some(index) => {
            serde_json::from_str(index).map_err(|_| "Stored SIWC account index is corrupt")?
        }
        None => vec![],
    };
    if !ids.iter().any(|id| id == registration_id) {
        ids.push(registration_id.to_string());
    }
    records.insert(key, session_json);
    records.insert(
        SIWC_INDEX_KEY.to_string(),
        serde_json::to_string(&ids).map_err(|_| "SIWC account index encoding failed")?,
    );
    write_values(&path, &records, &OsKeyVault)
}

pub(crate) fn list_native_siwc_session_ids(app: &tauri::AppHandle) -> Result<Vec<String>, String> {
    let path = siwc_credential_file(app)?;
    let _guard = secure_storage_lock()?;
    let records = read_values(&path, &OsKeyVault)?;
    match records.get(SIWC_INDEX_KEY) {
        Some(index) => {
            serde_json::from_str(index).map_err(|_| "Stored SIWC account index is corrupt".into())
        }
        None => Ok(Vec::new()),
    }
}
