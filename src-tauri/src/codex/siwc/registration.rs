use std::collections::HashMap;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct DeviceRegistration {
    pub registration_id: String,
    /// Issued by OpenAI authorization; never manufactured locally.
    pub client_id: String,
    pub subject: String,
    pub host_id: String,
    pub email: String,
    pub workspace_id: Option<String>,
    pub revoked: bool,
    pub created_at_ms: i64,
}

#[derive(Debug, Default)]
pub struct RegistrationStore {
    registrations: HashMap<String, DeviceRegistration>,
}

impl RegistrationStore {
    pub fn new() -> Self {
        Self {
            registrations: HashMap::new(),
        }
    }

    /// Records an already verified OpenAI OAuth client registration.
    /// This function does not authorize a user or validate a token: callers must
    /// finish PKCE exchange and cryptographic OIDC verification first.
    pub fn register_issued(
        &mut self,
        host_id: &str,
        issued_client_id: &str,
        subject: &str,
        email: &str,
        workspace_id: Option<&str>,
    ) -> Result<DeviceRegistration, String> {
        if host_id.trim().is_empty()
            || issued_client_id.trim().is_empty()
            || subject.trim().is_empty()
        {
            return Err("Host, issued OAuth client ID and validated subject are required".into());
        }
        let registration_id = format!("reg_{}", crate::auth::oauth::utils::random_base64url(16));
        let registration = DeviceRegistration {
            registration_id: registration_id.clone(),
            client_id: issued_client_id.to_owned(),
            subject: subject.to_owned(),
            host_id: host_id.to_owned(),
            email: email.to_owned(),
            workspace_id: workspace_id.map(str::to_owned),
            revoked: false,
            created_at_ms: chrono::Utc::now().timestamp_millis(),
        };
        self.registrations
            .insert(registration_id, registration.clone());
        Ok(registration)
    }

    pub fn revoke_registration(&mut self, registration_id: &str) -> bool {
        if let Some(reg) = self.registrations.get_mut(registration_id) {
            reg.revoked = true;
            true
        } else {
            false
        }
    }

    pub fn is_active(&self, registration_id: &str) -> bool {
        self.registrations
            .get(registration_id)
            .map(|r| !r.revoked)
            .unwrap_or(false)
    }

    pub fn get(&self, registration_id: &str) -> Option<&DeviceRegistration> {
        self.registrations.get(registration_id)
    }

    pub fn len(&self) -> usize {
        self.registrations.len()
    }

    pub fn is_empty(&self) -> bool {
        self.registrations.is_empty()
    }
}
