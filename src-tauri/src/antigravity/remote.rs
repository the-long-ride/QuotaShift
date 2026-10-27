use crate::types::AntigravityUsageCommandError;
use std::time::Duration;

mod logging;
mod platform;
use logging::{endpoint_name, format_http_failure_log};
use platform::*;

fn mask_email(email: Option<&str>) -> String {
    platform::mask_email(email)
}

const CLOUD_CODE_PROJECT_BASE_URL: &str = "https://cloudcode-pa.googleapis.com";
const CLOUD_CODE_QUOTA_BASE_URL: &str = "https://daily-cloudcode-pa.googleapis.com";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

#[derive(Debug, Clone)]
pub(crate) struct AntigravityRemoteConfig {
    pub project_base_url: String,
    pub quota_base_url: String,
    pub user_agent: String,
    pub client_name: String,
    pub client_version: String,
    pub timeout: Duration,
}
impl Default for AntigravityRemoteConfig {
    fn default() -> Self {
        let version = antigravity_ide_version();
        Self {
            project_base_url: CLOUD_CODE_PROJECT_BASE_URL.to_string(),
            quota_base_url: CLOUD_CODE_QUOTA_BASE_URL.to_string(),
            // The model catalog only lists CLI-gated models such as Gemini 4 Argon for the CLI client.
            user_agent: format!(
                "antigravity/cli/{} {}",
                version,
                platform_user_agent_segment()
            ),
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
    diagnostic_identity: String,
}
impl AntigravityRemoteClient {
    pub(crate) fn new(
        config: AntigravityRemoteConfig,
    ) -> Result<Self, AntigravityUsageCommandError> {
        let http = reqwest::Client::builder()
            .timeout(config.timeout)
            .build()
            .map_err(|e| AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                message: format!("HTTP client init failed: {}", e),
                retryable: true,
            })?;
        Ok(Self {
            http,
            config,
            diagnostic_identity: "account".to_string(),
        })
    }
    pub(crate) fn production() -> Result<Self, AntigravityUsageCommandError> {
        Self::new(AntigravityRemoteConfig::default())
    }
    pub(crate) fn with_diagnostic_email(mut self, email: Option<&str>) -> Self {
        self.diagnostic_identity = mask_email(email);
        self
    }
    pub(crate) fn diagnostic_identity(&self) -> &str {
        &self.diagnostic_identity
    }
    pub(crate) async fn load_code_assist(
        &self,
        access_token: &str,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let url = format!("{}/v1internal:loadCodeAssist", self.config.project_base_url);
        let body = serde_json::json!({
            "metadata": {
                "ideType": 9,
                "platform": platform_metadata(),
                "pluginType": 2
            },
            "mode": "FULL_ELIGIBILITY_CHECK"
        });
        self.send_post(&url, access_token, body, false).await
    }
    pub(crate) async fn retrieve_user_quota_summary(
        &self,
        access_token: &str,
        project_id: Option<&str>,
    ) -> Result<Option<serde_json::Value>, AntigravityUsageCommandError> {
        let body = match project_id {
            Some(pid) if !pid.trim().is_empty() => serde_json::json!({ "project": pid.trim() }),
            _ => serde_json::json!({}),
        };
        for base_url in [&self.config.quota_base_url, &self.config.project_base_url] {
            let url = format!("{}/v1internal:retrieveUserQuotaSummary", base_url);
            match self.send_post(&url, access_token, body.clone(), true).await {
                Ok(value) => return Ok(Some(value)),
                Err(error) if error.code == "ANTIGRAVITY_REAUTH_REQUIRED" => return Err(error),
                Err(_) => {}
            }
        }
        Ok(None)
    }
    pub(crate) async fn fetch_available_models(
        &self,
        access_token: &str,
        project_id: Option<&str>,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let url = format!(
            "{}/v1internal:fetchAvailableModels",
            self.config.quota_base_url
        );
        let body = match project_id {
            Some(pid) if !pid.trim().is_empty() => serde_json::json!({ "project": pid.trim() }),
            _ => serde_json::json!({}),
        };
        self.send_post(&url, access_token, body, true).await
    }
    async fn send_post(
        &self,
        url: &str,
        access_token: &str,
        body: serde_json::Value,
        include_client_headers: bool,
    ) -> Result<serde_json::Value, AntigravityUsageCommandError> {
        let endpoint = endpoint_name(url);
        let mut request = self
            .http
            .post(url)
            .bearer_auth(access_token)
            .header("User-Agent", &self.config.user_agent)
            .header("Content-Type", "application/json");
        if include_client_headers {
            request = request
                .header("X-Client-Name", &self.config.client_name)
                .header("X-Client-Version", &self.config.client_version);
        }
        let res = match request.json(&body).send().await {
            Ok(response) => response,
            Err(error) => {
                let result = if error.is_timeout() {
                    "timeout"
                } else {
                    "network_error"
                };
                crate::log_eprintln!(
                    "[antigravity_remote] {} {} {}",
                    self.diagnostic_identity,
                    endpoint,
                    result
                );
                if error.is_timeout() {
                    return Err(AntigravityUsageCommandError {
                        code: "ANTIGRAVITY_USAGE_TIMEOUT".to_string(),
                        message: "Request timed out".to_string(),
                        retryable: true,
                    });
                }
                return Err(AntigravityUsageCommandError {
                    code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                    message: format!("Network error: {}", error),
                    retryable: true,
                });
            }
        };
        let status = res.status();
        if let Some(message) =
            format_http_failure_log(&self.diagnostic_identity, endpoint, status.as_u16())
        {
            crate::log_eprintln!("{}", message);
        }
        let txt = res.text().await.unwrap_or_default();
        if status == reqwest::StatusCode::UNAUTHORIZED {
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_REAUTH_REQUIRED".to_string(),
                message: "Unauthorized (401)".to_string(),
                retryable: false,
            });
        }
        if status == reqwest::StatusCode::FORBIDDEN {
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_FORBIDDEN".to_string(),
                message: "Forbidden (403)".to_string(),
                retryable: false,
            });
        }
        if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_RATE_LIMITED".to_string(),
                message: "Rate limited (429)".to_string(),
                retryable: true,
            });
        }
        if !status.is_success() {
            return Err(AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_UPSTREAM_ERROR".to_string(),
                message: format!("Upstream HTTP status {}", status),
                retryable: true,
            });
        }
        serde_json::from_str::<serde_json::Value>(&txt).map_err(|error| {
            crate::log_eprintln!(
                "[antigravity_remote] {} {} invalid_json",
                self.diagnostic_identity,
                endpoint
            );
            AntigravityUsageCommandError {
                code: "ANTIGRAVITY_USAGE_INVALID_RESPONSE".to_string(),
                message: format!("Failed to parse JSON response: {}", error),
                retryable: true,
            }
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_user_agent_identifies_as_the_cli_client() {
        let config = AntigravityRemoteConfig::default();
        assert!(
            config.user_agent.starts_with("antigravity/cli/"),
            "{}",
            config.user_agent
        );
        assert!(config.user_agent.ends_with(platform_user_agent_segment()));
    }
}
