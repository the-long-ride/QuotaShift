//! Native-only access broker: serialized refresh-token rotation per process.
use super::token_exchange::{refresh_token, NativeSiwcSession};
use std::sync::OnceLock;
use tokio::sync::Mutex;

static REFRESH_LOCK: OnceLock<Mutex<()>> = OnceLock::new();

pub async fn get_usable_siwc_bearer(
    app: &tauri::AppHandle,
    registration_id: &str,
    client: &reqwest::Client,
) -> Result<String, String> {
    if !registration_id.starts_with("reg_") {
        return Err("Expected an issued SIWC registration reference".into());
    }
    // A global lock is intentionally conservative: multiple pools may share an
    // account and the OAuth refresh token must not be rotated concurrently.
    let _guard = REFRESH_LOCK.get_or_init(|| Mutex::new(())).lock().await;
    let owned_app = app.clone();
    let id = registration_id.to_owned();
    let json = tokio::task::spawn_blocking(move || {
        crate::storage::secure_storage::load_native_siwc_secret(&owned_app, &id)
    })
    .await
    .map_err(|_| "SIWC native credential worker failed")??
    .ok_or("SIWC account registration not found")?;
    let session: NativeSiwcSession =
        serde_json::from_str(&json).map_err(|_| "SIWC stored registration is damaged")?;

    if !session.requires_refresh() {
        return session
            .access_token()
            .map(str::to_owned)
            .ok_or("SIWC plan inference consent not granted".into());
    }
    let grant = refresh_token(client, session.client_id(), session.refresh_token()).await?;
    let updated = grant.rotate_session(session)?;
    let bearer = updated
        .access_token()
        .map(str::to_owned)
        .ok_or("ChatGPT plan inference consent missing after refresh")?;
    let json =
        serde_json::to_string(&updated).map_err(|_| "Cannot serialize rotated SIWC credentials")?;
    let owned_app = app.clone();
    let id = registration_id.to_owned();
    tokio::task::spawn_blocking(move || {
        crate::storage::secure_storage::save_native_siwc_session(&owned_app, &id, json)
    })
    .await
    .map_err(|_| "SIWC native refresh storage worker failed")??;
    Ok(bearer)
}
