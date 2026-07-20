use std::time::Duration;
use crate::types::AntigravityUsageCommandError;

const CLOUD_CODE_BASE_URL: &str = "https://cloudcode-pa.googleapis.com";
const ANTIGRAVITY_USER_AGENT: &str = "antigravity/cli/2.0";
const ANTIGRAVITY_CLIENT_NAME: &str = "antigravity";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub(crate) struct AntigravityRemoteConfig {
    pub base_url: String,
    pub user_agent: String,
    pub client_name: String,
    pub client_version: String,
    pub timeout: Duration,
}

impl Default for AntigravityRemoteConfig {
    fn default() -> Self {
        let version = option_env!("QUOTASHIFT_AG_CLIENT_VERSION")
            .unwrap_or(env!("CARGO_PKG_VERSION"))
            .to_string();
        Self {
            base_url: CLOUD_CODE_BASE_URL.to_string(),
            user_agent: ANTIGRAVITY_USER_AGENT.to_string(),
            client_name: ANTIGRAVITY_CLIENT_NAME.to_string(),
            client_version: version,
            timeout: REQUEST_TIMEOUT,
        }
    }
}

#[derive(Clone)]
pub(crate) struct AntigravityRemoteClient {
    http: reqwest::Client,
    config: AntigravityRemoteConfig,
}

impl AntigravityRemoteClient {
    pub(crate) fn new(config: AntigravityRemoteConfig) -> Result<Self, AntigravityUsageCommandError> {
        let http = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                message: format!("HTTP client init failed: {}", e),
                retryable: true,
            })?;
        Ok(Self { http, config })
    }

    pub(crate) fn production() -> Result<Self, AntigravityUsageCommandError> {
        Self::new(AntigravityRemoteConfig::default())
    }

    pub(crate) async fn load_code_assist(
        &self,
        access_token: &str,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let url = format!("{}/v1internal:loadCodeAssist", self.config.base_url);
        let body = serde_json::json!({
            "metadata": {
                "ideType": "ANTIGRAVITY",
                "platform": "PLATFORM_UNSPECIFIED",
                "pluginType": "GEMINI"
            }
        });
        self.send_post(&url, access_token, body).await
    }

    pub(crate) async fn fetch_available_models(
        &self,
        access_token: &str,
        project_id: Option<&str>,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let url = format!("{}/v1internal:fetchAvailableModels", self.config.base_url);
        let body = match project_id {
            Some(pid) if !pid.trim().is_empty() => serde_json::json!({ "project": pid.trim() }),
            _ => serde_json::json!({}),
        };
        self.send_post(&url, access_token, body).await
    }

    pub(crate) async fn retrieve_user_quota(
        &self,
        access_token: &str,
        project_id: Option<&str>,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let url = format!("{}/v1internal:retrieveUserQuota", self.config.base_url);
        let body = match project_id {
            Some(pid) if !pid.trim().is_empty() => serde_json::json!({ "project": pid.trim() }),
            _ => serde_json::json!({}),
        };
        self.send_post(&url, access_token, body).await
    }

    async fn send_post(
        &self,
        url: &str,
        access_token: &str,
        body: serde_json::Value,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        eprintln!("[antigravity_remote] ---> POST {}", url);

        let res = self.http
            .post(url)
            .bearer_auth(access_token)
            .header("User-Agent", &self.config.user_agent)
            .header("X-Client-Name", &self.config.client_name)
            .header("X-Client-Version", &self.config.client_version)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await;

        let res = match res {
            Ok(r) => r,
            Err(e) => {
                eprintln!("[antigravity_remote] <--- Connection error: {}", e);
                if e.is_timeout() {
                    return Err(AntigravityUsageCommandError {
                        code: "ANTIGRAVITY_USAGE_TIMEOUT".to_string(),
                        message: "Request timed out".to_string(),
                        retryable: true,
                    });
                }
                return Err(AntigravityUsageCommandError {
                    code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                    message: format!("Network error: {}", e),
                    retryable: true,
                });
            }
        };

        let status = res.status();
        eprintln!("[antigravity_remote] <--- HTTP {} from {}", status, url);
        let txt = res.text().await.unwrap_or_default();

        if status == reqwest::StatusCode::UNAUTHORIZED {
            eprintln!("[antigravity_remote] <--- 401 Unauthorized");
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_REAUTH_REQUIRED".to_string(),
                message: "Unauthorized (401)".to_string(),
                retryable: false,
            });
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            eprintln!("[antigravity_remote] <--- 403 Forbidden");
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_FORBIDDEN".to_string(),
                message: "Forbidden (403)".to_string(),
                retryable: false,
            });
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            eprintln!("[antigravity_remote] <--- 429 Rate Limited");
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_RATE_LIMITED".to_string(),
                message: "Rate limited (429)".to_string(),
                retryable: true,
            });
        }
        if !status.is_success() {
            eprintln!("[antigravity_remote] <--- HTTP error");
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                message: format!("Upstream HTTP status {}", status),
                retryable: true,
            });
        }

        match serde_json::from_str::<serde_json::Value>(&txt) {
            Ok(json_val) => {
                eprintln!("[antigravity_remote] <--- SUCCESS Response JSON from {}", url);
                Ok(json_val)
            }
            Err(e) => {
                eprintln!("[antigravity_remote] <--- JSON parse error");
                Err(AntigravityUsageCommandError {
                    code: "ANTIGRAVITY_USAGE_INVALID_RESPONSE".to_string(),
                    message: format!("Failed to parse JSON response: {}", e),
                    retryable: true,
                })
            }
        }
    }
}
