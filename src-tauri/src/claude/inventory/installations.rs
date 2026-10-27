use std::path::{Path, PathBuf};

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeInstallation {
    pub path: PathBuf,
    pub canonical_path: String,
    pub version: Option<String>,
    pub provenance: String,
    pub is_wsl: bool,
    pub requires_explicit_confirmation: bool,
}

pub fn canonical_windows_path(path: &Path) -> Result<PathBuf, String> {
    let s = path.to_string_lossy();
    let cleaned = s.strip_prefix(r"\\?\").unwrap_or(&s);
    let normalized = cleaned.replace('/', "\\");
    let pb = PathBuf::from(normalized);

    // Normalize path separators and remove redundant components
    if pb.is_absolute() {
        Ok(pb)
    } else {
        match std::env::current_dir() {
            Ok(cwd) => Ok(cwd.join(pb)),
            Err(_) => Ok(pb),
        }
    }
}

pub fn is_wsl_path(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    s.starts_with(r"\\wsl$\")
        || s.starts_with(r"\\wsl.localhost\")
        || s.starts_with("/usr/")
        || s.starts_with("/bin/")
        || s.starts_with("/mnt/")
}

pub fn is_shim(path: &Path) -> bool {
    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
        let ext_lower = ext.to_lowercase();
        ext_lower == "cmd" || ext_lower == "bat" || ext_lower == "ps1"
    } else {
        false
    }
}

pub fn is_path_in_standard_locations(path: &Path) -> bool {
    let s = path.to_string_lossy().to_lowercase();
    s.contains("program files")
        || s.contains("appdata\\roaming\\npm")
        || s.contains("appdata\\local\\programs")
        || s.contains(".local\\bin")
}

pub fn inspect_installation_candidate(path: &Path) -> Result<ClaudeInstallation, String> {
    if is_wsl_path(path) {
        return Err(format!(
            "WSL executable path '{}' is not supported in native Windows release",
            path.display()
        ));
    }

    let canonical = canonical_windows_path(path)?;
    let canonical_str = canonical.to_string_lossy().to_string();

    let is_standard = is_path_in_standard_locations(&canonical);
    let requires_explicit = !is_standard;

    // Never execute shims or unknown binaries during discovery
    let is_script_shim = is_shim(path);
    let provenance = if is_script_shim {
        "npm_shim".to_string()
    } else if is_standard {
        "standard_native".to_string()
    } else {
        "manual_selection".to_string()
    };

    Ok(ClaudeInstallation {
        path: path.to_path_buf(),
        canonical_path: canonical_str,
        version: None, // Queried only after explicit user selection or verified binary
        provenance,
        is_wsl: false,
        requires_explicit_confirmation: requires_explicit,
    })
}

pub fn discover_claude_installations(candidates: &[PathBuf]) -> Vec<ClaudeInstallation> {
    let mut results = Vec::new();
    for c in candidates {
        if let Ok(inst) = inspect_installation_candidate(c) {
            results.push(inst);
        }
    }
    results
}
