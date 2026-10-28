//! Stable opaque SIWC host identity scoped to this local app installation.
use std::fs::{self, OpenOptions};
use std::io::Write;
use tauri::Manager;

pub fn get_or_create_siwc_host_id(app: &tauri::AppHandle) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "Cannot resolve app data directory for SIWC")?;
    fs::create_dir_all(&dir).map_err(|_| "Cannot prepare SIWC host directory")?;
    let file = dir.join("siwc-host-id-v1.txt");
    if file.exists() {
        let saved = fs::read_to_string(&file).map_err(|_| "Cannot read SIWC host identity")?;
        if is_valid_host_id(saved.trim()) {
            return Ok(saved.trim().to_owned());
        }
        return Err("Existing SIWC host identity is invalid; refusing to replace it".into());
    }
    use rand::RngCore;
    let mut random = [0u8; 16];
    rand::rngs::OsRng.fill_bytes(&mut random);
    random[6] = (random[6] & 0x0f) | 0x40;
    random[8] = (random[8] & 0x3f) | 0x80;
    let id = format!(
        "urn:uuid:{:08x}-{:04x}-{:04x}-{:04x}-{:012x}",
        u32::from_be_bytes(random[0..4].try_into().unwrap()),
        u16::from_be_bytes(random[4..6].try_into().unwrap()),
        u16::from_be_bytes(random[6..8].try_into().unwrap()),
        u16::from_be_bytes(random[8..10].try_into().unwrap()),
        u64::from_be_bytes([
            0, 0, random[10], random[11], random[12], random[13], random[14], random[15]
        ]),
    );
    match OpenOptions::new().write(true).create_new(true).open(&file) {
        Ok(mut handle) => {
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                handle
                    .set_permissions(fs::Permissions::from_mode(0o600))
                    .map_err(|_| "Cannot set host ID file permissions")?;
            }
            handle
                .write_all(id.as_bytes())
                .and_then(|_| handle.sync_all())
                .map_err(|_| "Cannot persist SIWC host identity")?;
            Ok(id)
        }
        Err(err) if err.kind() == std::io::ErrorKind::AlreadyExists => {
            let saved = fs::read_to_string(&file)
                .map_err(|_| "Cannot read concurrent SIWC host identity")?;
            if is_valid_host_id(saved.trim()) {
                Ok(saved.trim().to_owned())
            } else {
                Err("Concurrent SIWC host identity is invalid".into())
            }
        }
        Err(_) => Err("Cannot create SIWC host identity".into()),
    }
}

pub fn is_valid_host_id(value: &str) -> bool {
    let Some(uuid) = value.strip_prefix("urn:uuid:") else {
        return false;
    };
    if uuid.len() != 36 {
        return false;
    }
    uuid.bytes().enumerate().all(|(i, b)| {
        if [8, 13, 18, 23].contains(&i) {
            b == b'-'
        } else {
            b.is_ascii_hexdigit()
        }
    }) && uuid.as_bytes()[14] == b'4'
        && matches!(
            uuid.as_bytes()[19].to_ascii_lowercase(),
            b'8' | b'9' | b'a' | b'b'
        )
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_uuidv4_only() {
        assert!(is_valid_host_id(
            "urn:uuid:00000000-0000-4000-8000-000000000001"
        ));
        assert!(!is_valid_host_id(
            "urn:uuid:00000000-0000-1000-8000-000000000001"
        ));
        assert!(!is_valid_host_id("urn:uuid:../secrets"));
    }
}
