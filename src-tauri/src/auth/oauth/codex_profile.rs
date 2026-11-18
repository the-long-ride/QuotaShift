use serde_json::Value;

pub async fn fetch_chatgpt_profile(access_token: String) -> Result<Value, String> {
    let client = crate::http_client::shared_client();
    let res = client
        .get("https://chatgpt.com/backend-api/me")
        .bearer_auth(access_token)
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to fetch ChatGPT profile ({status}): {body}"
        ));
    }

    res.json().await.map_err(|e| e.to_string())
}
