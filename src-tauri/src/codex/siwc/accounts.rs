use std::collections::HashMap;

/// Public DTO safe for the React renderer.
/// Contains no sensitive tokens or secret credentials.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct SiwcAccount {
    pub id: String,
    pub label: String,
    pub email: String,
    pub workspace_id: Option<String>,
    pub plan_type: String,
    pub is_routable: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SiwcCredentials {
    pub access_token: String,
    pub refresh_token: String,
}

#[derive(Debug, Default)]
pub struct SiwcAccountStore {
    credentials: HashMap<String, SiwcCredentials>,
    accounts: HashMap<String, SiwcAccount>,
}

impl SiwcAccountStore {
    pub fn new() -> Self {
        Self {
            credentials: HashMap::new(),
            accounts: HashMap::new(),
        }
    }

    pub fn insert_account(&mut self, id: &str, access_token: &str, refresh_token: &str) {
        self.credentials.insert(
            id.to_string(),
            SiwcCredentials {
                access_token: access_token.to_string(),
                refresh_token: refresh_token.to_string(),
            },
        );
    }

    pub fn rotate_refresh_token(
        &mut self,
        id: &str,
        expected_prev_refresh: &str,
        new_access: &str,
        new_refresh: &str,
    ) -> Result<(), String> {
        let creds = self
            .credentials
            .get_mut(id)
            .ok_or_else(|| format!("Account '{}' not found in credentials store", id))?;

        if creds.refresh_token != expected_prev_refresh {
            return Err(format!(
                "Stale or replayed refresh token rejected for account '{}'",
                id
            ));
        }

        creds.access_token = new_access.to_string();
        creds.refresh_token = new_refresh.to_string();
        Ok(())
    }

    pub fn get_credentials(&self, id: &str) -> Option<&SiwcCredentials> {
        self.credentials.get(id)
    }

    pub fn remove_account(&mut self, id: &str) -> bool {
        let removed_cred = self.credentials.remove(id).is_some();
        let removed_acc = self.accounts.remove(id).is_some();
        removed_cred || removed_acc
    }

    pub fn set_account_metadata(&mut self, account: SiwcAccount) {
        self.accounts.insert(account.id.clone(), account);
    }

    pub fn get_account_metadata(&self, id: &str) -> Option<&SiwcAccount> {
        self.accounts.get(id)
    }
}

#[derive(Debug, Default)]
pub struct AccountCatalog {
    eligibility: HashMap<String, bool>,
}

impl AccountCatalog {
    pub fn new() -> Self {
        Self {
            eligibility: HashMap::new(),
        }
    }

    pub fn add_account(&mut self, id: &str, is_eligible: bool) {
        self.eligibility.insert(id.to_string(), is_eligible);
    }

    pub fn remove_account(&mut self, id: &str) {
        self.eligibility.remove(id);
    }

    pub fn is_eligible(&self, id: &str) -> bool {
        self.eligibility.get(id).copied().unwrap_or(false)
    }
}
