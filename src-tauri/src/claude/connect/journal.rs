pub use super::journal_sync::{restore_profile_settings_to_default, sync_journals_with_registry};
use super::settings_keys::{drop_created_env, get_setting, remove_setting, set_setting};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct PatchJournalEntry {
    pub timestamp_ms: i64,
    pub profile_path: PathBuf,
    pub original_keys: HashMap<String, Option<serde_json::Value>>,
    pub patched_keys: Vec<String>,
    #[serde(default)]
    pub patched_values: HashMap<String, serde_json::Value>,
    /// The patch created `env` (it did not exist before), so revert may drop it again.
    #[serde(default)]
    pub created_env: bool,
    /// Claude profile this patch belongs to (display and cleanup listing only).
    #[serde(default)]
    pub profile_id: String,
}

pub fn save_journal(entry: &PatchJournalEntry, journal_path: &Path) -> Result<(), String> {
    let json_bytes = serde_json::to_vec_pretty(entry)
        .map_err(|e| format!("Failed to serialize journal entry: {e}"))?;
    std::fs::write(journal_path, json_bytes).map_err(|e| {
        format!(
            "Failed to write journal to '{}': {e}",
            journal_path.display()
        )
    })
}

pub fn load_journal(journal_path: &Path) -> Result<PatchJournalEntry, String> {
    let content = std::fs::read_to_string(journal_path).map_err(|e| {
        format!(
            "Failed to read journal from '{}': {e}",
            journal_path.display()
        )
    })?;
    serde_json::from_str(&content).map_err(|e| format!("Failed to parse journal JSON: {e}"))
}

pub fn atomic_crash_recovery(journal_path: &Path, settings_path: &Path) -> Result<(), String> {
    if !journal_path.is_file() {
        return Ok(());
    }

    let journal = load_journal(journal_path)?;
    if settings_path.is_file() {
        let content = std::fs::read_to_string(settings_path)
            .map_err(|e| format!("Failed to read settings: {e}"))?;
        let mut root: serde_json::Value = serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse settings JSON: {e}"))?;

        if !root.is_object() {
            return Err("Settings root is not a JSON object".to_string());
        }
        for key in &journal.patched_keys {
            let expected = journal.patched_values.get(key).ok_or_else(|| {
                format!("recovery conflict: missing committed value for managed key {key}")
            })?;
            if get_setting(&root, key) != Some(expected) {
                return Err(format!("recovery conflict: managed key {key} was changed"));
            }
        }
        for key in &journal.patched_keys {
            let original = journal
                .original_keys
                .get(key)
                .ok_or_else(|| format!("missing original value for {key}"))?;
            match original {
                Some(value) => set_setting(&mut root, key, value.clone())?,
                None => remove_setting(&mut root, key)?,
            }
        }
        drop_created_env(&mut root, journal.created_env);

        let updated = serde_json::to_string_pretty(&root)
            .map_err(|e| format!("Failed to serialize recovered settings: {e}"))?;
        std::fs::write(settings_path, updated)
            .map_err(|e| format!("Failed to write recovered settings: {e}"))?;
    }

    let _ = std::fs::remove_file(journal_path);
    Ok(())
}
