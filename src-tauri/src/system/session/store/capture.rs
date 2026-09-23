use serde::Serialize;
#[cfg(any(target_os = "macos", target_os = "linux", test))]
use serde_json::json;
use serde_json::{Map, Value};

use super::{get_antigravity_db_paths, python_command, READ_VSCDB_PY};

const ACCESS_TOKEN_KEY: &str = "antigravityUnifiedStateSync.oauthToken";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturedAntigravitySession {
    source: &'static str,
    session: Map<String, Value>,
}

fn valid_session(map: &Map<String, Value>) -> bool {
    map.get(ACCESS_TOKEN_KEY)
        .and_then(Value::as_str)
        .is_some_and(|token| !token.trim().is_empty())
}

#[cfg(any(target_os = "macos", target_os = "linux", test))]
fn parse_keyring_secret(secret: &str) -> Result<Option<Map<String, Value>>, String> {
    let data: Value = serde_json::from_str(secret)
        .map_err(|_| "Antigravity keyring has an unsupported format".to_string())?;
    let token = &data["token"];
    let mut session = json!({
        "antigravityUnifiedStateSync.oauthToken": token["access_token"],
        "antigravity.refreshToken": token["refresh_token"],
        "antigravity.idToken": data["id_token"],
        "antigravity.authMethod": data["auth_method"],
    });
    Ok(session
        .as_object_mut()
        .map(std::mem::take)
        .filter(valid_session))
}

#[cfg(target_os = "windows")]
fn read_shared_keyring() -> Result<Option<Map<String, Value>>, String> {
    let output = python_command()
        .args(["-c", super::READ_CRED_MGR_PY])
        .output()
        .map_err(|_| "Could not read Antigravity keyring".to_string())?;
    if !output.status.success() {
        return Err("Could not read Antigravity keyring".to_string());
    }
    Ok(serde_json::from_slice::<Value>(&output.stdout)
        .ok()
        .and_then(|value| value.as_object().cloned())
        .filter(valid_session))
}

#[cfg(any(target_os = "macos", target_os = "linux"))]
fn read_shared_keyring() -> Result<Option<Map<String, Value>>, String> {
    let entry = keyring::Entry::new("gemini", "antigravity")
        .map_err(|_| "Could not open Antigravity keyring".to_string())?;
    let secret = match entry.get_password() {
        Ok(secret) => secret,
        Err(keyring::Error::NoEntry) => return Ok(None),
        Err(_) => return Err("Could not read Antigravity keyring".to_string()),
    };
    parse_keyring_secret(&secret)
}

#[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
fn read_shared_keyring() -> Result<Option<Map<String, Value>>, String> {
    Ok(None)
}

fn read_ide_profiles() -> Result<Vec<Map<String, Value>>, String> {
    let paths = get_antigravity_db_paths()
        .iter()
        .map(|path| path.to_string_lossy().to_string())
        .collect::<Vec<_>>()
        .join("|");
    let output = python_command()
        .args(["-c", READ_VSCDB_PY, &paths, "--all"])
        .output()
        .map_err(|_| "Could not read Antigravity IDE profiles".to_string())?;
    if !output.status.success() {
        return Err("Could not read Antigravity IDE profiles".to_string());
    }
    Ok(serde_json::from_slice::<Vec<Value>>(&output.stdout)
        .map_err(|_| "Antigravity IDE profiles returned invalid data".to_string())?
        .into_iter()
        .filter_map(|value| value.as_object().cloned())
        .filter(valid_session)
        .collect())
}

pub async fn read_antigravity_sessions() -> Result<Vec<CapturedAntigravitySession>, String> {
    let keyring = read_shared_keyring();
    let ide_profiles = read_ide_profiles();
    let runtime = super::super::detect_antigravity_runtime();
    let mut sessions = Vec::new();
    let keyring_session = keyring.as_ref().ok().and_then(Option::as_ref);

    if runtime.cli_detected || !runtime.ide_detected {
        if let Some(session) = keyring_session {
            sessions.push(CapturedAntigravitySession {
                source: "Antigravity 2.0 / agy",
                session: session.clone(),
            });
        }
    }
    if let Ok(profiles) = &ide_profiles {
        sessions.extend(
            profiles
                .iter()
                .cloned()
                .map(|session| CapturedAntigravitySession {
                    source: "Antigravity IDE",
                    session,
                }),
        );
    }
    if runtime.ide_detected && !runtime.cli_detected {
        if let Some(session) = keyring_session {
            sessions.push(CapturedAntigravitySession {
                source: "Antigravity 2.0 / agy",
                session: session.clone(),
            });
        }
    }
    if sessions.is_empty() {
        ide_profiles?;
        keyring?;
    }
    Ok(sessions)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keyring_capture_accepts_shared_antigravity_credentials() {
        let secret = r#"{"token":{"access_token":"access","refresh_token":"refresh"},"id_token":"identity","auth_method":"enterprise"}"#;
        let session = parse_keyring_secret(secret).unwrap().unwrap();
        assert_eq!(session[ACCESS_TOKEN_KEY], "access");
        assert_eq!(session["antigravity.refreshToken"], "refresh");
        assert_eq!(session["antigravity.idToken"], "identity");
        assert_eq!(session["antigravity.authMethod"], "enterprise");
    }

    #[test]
    fn keyring_capture_rejects_missing_access_token() {
        assert!(
            parse_keyring_secret(r#"{"token":{"refresh_token":"refresh"}}"#)
                .unwrap()
                .is_none()
        );
    }
}
