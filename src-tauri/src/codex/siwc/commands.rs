//! Native SIWC enrollment; renderer receives only account metadata and browser URL.
use super::host::get_or_create_siwc_host_id;
use super::oauth::{build_siwc_authorization_url, generate_pkce_params};
use super::token_exchange::NativeSiwcSession;
use serde::Serialize;
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Arc, Mutex,
};
use tauri::AppHandle;

struct ActiveSiwcSignIn {
    attempt_id: u64,
    authorization_url: String,
    registration_id: Option<String>,
    expected_subject: Option<String>,
    linked_codex_account_id: Option<String>,
    cancel_tx: Option<tokio::sync::oneshot::Sender<()>>,
}

#[derive(Default, Clone)]
pub struct SiwcSignInState {
    active: Arc<Mutex<Option<ActiveSiwcSignIn>>>,
    last_error: Arc<Mutex<Option<String>>>,
    next_id: Arc<AtomicU64>,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SiwcSignInStatus {
    pub pending: bool,
    pub registration_id: Option<String>,
    pub linked_codex_account_id: Option<String>,
    pub last_error: Option<String>,
}

impl SiwcSignInState {
    pub fn status(&self) -> SiwcSignInStatus {
        let guard = self.active.lock().unwrap();
        let last_error = self.last_error.lock().unwrap().clone();
        match guard.as_ref() {
            Some(active) => SiwcSignInStatus {
                pending: true,
                registration_id: active.registration_id.clone(),
                linked_codex_account_id: active.linked_codex_account_id.clone(),
                last_error: None,
            },
            None => SiwcSignInStatus {
                pending: false,
                registration_id: None,
                linked_codex_account_id: None,
                last_error,
            },
        }
    }

    pub fn record_error(&self, error: impl Into<String>) {
        *self.last_error.lock().unwrap() = Some(error.into());
    }

    pub fn existing_url_for(
        &self,
        registration_id: Option<&str>,
        expected_subject: Option<&str>,
        linked_codex_account_id: Option<&str>,
    ) -> Option<String> {
        let guard = self.active.lock().unwrap();
        let active = guard.as_ref()?;
        if !active.authorization_url.is_empty()
            && active.registration_id.as_deref() == registration_id
            && active.expected_subject.as_deref() == expected_subject
            && active.linked_codex_account_id.as_deref() == linked_codex_account_id
        {
            Some(active.authorization_url.clone())
        } else {
            None
        }
    }

    pub fn begin_attempt(
        &self,
        registration_id: Option<String>,
        expected_subject: Option<String>,
        linked_codex_account_id: Option<String>,
    ) -> Result<u64, String> {
        let mut guard = self.active.lock().unwrap();
        if guard.is_some() {
            return Err("A ChatGPT sign-in is already underway".into());
        }
        *self.last_error.lock().unwrap() = None;
        let attempt_id = self.next_id.fetch_add(1, Ordering::SeqCst) + 1;
        *guard = Some(ActiveSiwcSignIn {
            attempt_id,
            authorization_url: String::new(),
            registration_id,
            expected_subject,
            linked_codex_account_id,
            cancel_tx: None,
        });
        Ok(attempt_id)
    }

    pub fn activate_attempt(
        &self,
        attempt_id: u64,
        authorization_url: String,
        cancel_tx: tokio::sync::oneshot::Sender<()>,
    ) {
        let mut guard = self.active.lock().unwrap();
        if let Some(active) = guard.as_mut().filter(|a| a.attempt_id == attempt_id) {
            active.authorization_url = authorization_url;
            active.cancel_tx = Some(cancel_tx);
        }
    }

    pub fn clear_attempt(&self, attempt_id: u64) {
        let mut guard = self.active.lock().unwrap();
        if guard.as_ref().is_some_and(|a| a.attempt_id == attempt_id) {
            *guard = None;
        }
    }

    pub fn cancel(&self) -> bool {
        let mut guard = self.active.lock().unwrap();
        *self.last_error.lock().unwrap() = None;
        if let Some(mut active) = guard.take() {
            if let Some(tx) = active.cancel_tx.take() {
                let _ = tx.send(());
            }
            true
        } else {
            false
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SiwcAccountView {
    pub id: String,
    pub email: String,
    pub client_id: String,
    pub subject: String,
    pub is_routable: bool,
    pub linked_codex_account_id: Option<String>,
}

pub fn list_native_accounts(app: &AppHandle) -> Result<Vec<SiwcAccountView>, String> {
    let mut accounts = Vec::new();
    for id in crate::storage::secure_storage::list_native_siwc_session_ids(app)? {
        let Some(json) = crate::storage::secure_storage::load_native_siwc_secret(app, &id)? else {
            continue;
        };
        let session: NativeSiwcSession =
            serde_json::from_str(&json).map_err(|_| "Stored SIWC session record damaged")?;
        accounts.push(SiwcAccountView {
            id,
            email: session.email().to_string(),
            subject: session.subject().to_string(),
            client_id: session.client_id().to_string(),
            is_routable: session.is_routable(),
            linked_codex_account_id: session.linked_codex_account_id().map(str::to_owned),
        });
    }
    Ok(accounts)
}

#[tauri::command]
pub fn list_siwc_accounts(app: AppHandle) -> Result<Vec<SiwcAccountView>, String> {
    list_native_accounts(&app)
}

#[tauri::command]
pub async fn start_siwc_sign_in(
    app: AppHandle,
    state: tauri::State<'_, SiwcSignInState>,
    registration_id: Option<String>,
    expected_subject: Option<String>,
    linked_codex_account_id: Option<String>,
) -> Result<String, String> {
    if let Some(existing_url) = state.existing_url_for(
        registration_id.as_deref(),
        expected_subject.as_deref(),
        linked_codex_account_id.as_deref(),
    ) {
        return Ok(existing_url);
    }
    let attempt_id = state.begin_attempt(
        registration_id.clone(),
        expected_subject.clone(),
        linked_codex_account_id.clone(),
    )?;
    let result = async {
        if expected_subject
            .as_ref()
            .is_some_and(|s| s.is_empty() || s.len() > 256)
        {
            return Err("Invalid expected Codex account subject".into());
        }
        if let Some(linked_id) = linked_codex_account_id.as_deref() {
            if !linked_id.starts_with("acct-oauth-")
                || linked_id.len() > 160
                || expected_subject.is_none()
            {
                return Err(
                    "A Codex workspace link requires its OAuth account ID and identity".into(),
                );
            }
        }
        let returning = if let Some(id) = registration_id {
            Some(
                list_native_accounts(&app)?
                    .into_iter()
                    .find(|r| r.id == id)
                    .ok_or("Saved SIWC registration does not exist")?,
            )
        } else {
            None
        };
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|_| "Cannot open local SIWC callback listener")?;
        let port = listener
            .local_addr()
            .map_err(|_| "Cannot determine SIWC callback port")?
            .port();
        let host = get_or_create_siwc_host_id(&app)?;
        let params = generate_pkce_params();
        let url = build_siwc_authorization_url(
            &host,
            port,
            returning.as_ref().map(|r| r.client_id.as_str()),
            &params,
        )?;
        let (cancel_tx, cancel_rx) = tokio::sync::oneshot::channel();
        state.activate_attempt(attempt_id, url.clone(), cancel_tx);
        tokio::spawn(super::callback::serve_siwc_callback(
            listener,
            app,
            params,
            returning,
            expected_subject,
            linked_codex_account_id,
            state.inner().clone(),
            attempt_id,
            cancel_rx,
        ));
        Ok::<_, String>(url)
    }
    .await;
    if result.is_err() {
        state.clear_attempt(attempt_id);
    }
    result
}

#[tauri::command]
pub fn cancel_siwc_sign_in(state: tauri::State<'_, SiwcSignInState>) -> Result<bool, String> {
    Ok(state.cancel())
}

#[tauri::command]
pub fn get_siwc_sign_in_status(
    state: tauri::State<'_, SiwcSignInState>,
) -> Result<SiwcSignInStatus, String> {
    Ok(state.status())
}

#[tauri::command]
pub async fn get_siwc_models(
    app: AppHandle,
    registration_id: String,
) -> Result<Vec<super::models::SiwcModelView>, String> {
    let available = list_native_accounts(&app)?;
    if !available.iter().any(|a| a.id == registration_id) {
        return Err("This SIWC account is not authorized or needs token refresh".into());
    }
    let client = reqwest::Client::new();
    let bearer =
        super::native_access::get_usable_siwc_bearer(&app, &registration_id, &client).await?;
    super::models::fetch_siwc_models(&client, &bearer).await
}
