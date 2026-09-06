use std::time::Duration;

use crate::types::AntigravityUsageCommandError;

const CLOUD_CODE_PROJECT_BASE_URL: &str = "https://cloudcode-pa.googleapis.com";
const CLOUD_CODE_QUOTA_BASE_URL: &str = "https://daily-cloudcode-pa.googleapis.com";
const ANTIGRAVITY_IDE_VERSION: &str = "2.11.0";
const ANTIGRAVITY_CLIENT_NAME: &str = "antigravity";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(10);

fn antigravity_ide_version() -> String {
    option_env!("QUOTASHIFT_AG_CLIENT_VERSION")
        .unwrap_or(ANTIGRAVITY_IDE_VERSION)
        .to_string()
}

fn platform_metadata() -> u8 {
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return 1;
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return 2;
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return 3;
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return 4;
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return 5;
    }
    #[allow(unreachable_code)]
    0
}

fn platform_user_agent_segment() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return "windows/amd64";
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        return "windows/arm64";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "linux/amd64";
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return "linux/arm64";
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return "darwin/amd64";
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "darwin/arm64";
    }
    #[allow(unreachable_code)]
    "unknown/unknown"
}

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
            user_agent: format!(
                "antigravity/ide/{} {}",
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
        let url = format!(
            "{}/v1internal:loadCodeAssist",
            self.config.project_base_url
        );
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
        eprintln!("[antigravity_remote] ---> POST {}", url);

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

        let res = request.json(&body).send().await;

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
