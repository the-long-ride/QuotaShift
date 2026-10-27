//! Explicit SIWC sign-out: revoke the renewable session and clear local credentials.
//! The caller receives no token data, only whether revocation was confirmed.
use super::token_exchange::NativeSiwcSession;
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiwcDisconnectResult {
    pub remotely_revoked: bool,
}

async fn revoke_remote(session: &NativeSiwcSession) -> Result<(), String> {
    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::none())
        .timeout(std::time::Duration::from_secs(12))
        .build()
        .map_err(|_| "Cannot create SIWC revocation client")?;
    let response = client
        .get("https://auth.openai.com/.well-known/openid-configuration")
        .send()
        .await
        .map_err(|_| "OIDC discovery unavailable")?;
    if !response.status().is_success() {
        return Err("OIDC discovery failed".into());
    }
    let doc: serde_json::Value = response
        .json()
        .await
        .map_err(|_| "Invalid OpenAI OIDC discovery")?;
    let raw = doc
        .get("revocation_endpoint")
        .and_then(|v| v.as_str())
        .ok_or("OpenAI OIDC discovery does not advertise revocation")?;
    let url = reqwest::Url::parse(raw).map_err(|_| "Invalid SIWC revocation endpoint")?;
    if url.scheme() != "https"
        || url.host_str() != Some("auth.openai.com")
        || url.port().is_some()
        || !url.username().is_empty()
        || url.password().is_some()
        || url.fragment().is_some()
    {
        return Err("Untrusted SIWC revocation endpoint".into());
    }
    let result = client
        .post(url)
        .form(&[
            ("token", session.refresh_token()),
            ("token_type_hint", "refresh_token"),
            ("client_id", session.client_id()),
        ])
        .send()
        .await
        .map_err(|_| "SIWC token revocation request failed")?;
    if result.status() != reqwest::StatusCode::OK {
        return Err("SIWC remote revocation not confirmed".into());
    }
    Ok(())
}

/// Only the selected opaque registration is affected; other accounts remain untouched.
#[tauri::command]
pub async fn disconnect_siwc_account(
    app: tauri::AppHandle,
    registration_id: String,
) -> Result<SiwcDisconnectResult, String> {
    if !registration_id.starts_with("reg_") {
        return Err("Invalid SIWC registration identifier".into());
    }
    let json = crate::storage::secure_storage::load_native_siwc_secret(&app, &registration_id)?
        .ok_or("SIWC account not found")?;
    let session: NativeSiwcSession =
        serde_json::from_str(&json).map_err(|_| "Stored SIWC account record is invalid")?;
    let remotely_revoked = revoke_remote(&session).await.is_ok();
    // Sign-out explicitly disconnects even when remote revocation cannot be confirmed.
    // The UI must present a warning in that case.
    crate::storage::secure_storage::delete_native_siwc_secret(&app, &registration_id)?;
    Ok(SiwcDisconnectResult { remotely_revoked })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn disconnect_result_does_not_expose_sensitive_tokens() {
        let serialized = serde_json::to_string(&SiwcDisconnectResult {
            remotely_revoked: false,
        })
        .unwrap();
        assert!(!serialized.contains("token"));
        assert!(serialized.contains("remotelyRevoked"));
    }
}
