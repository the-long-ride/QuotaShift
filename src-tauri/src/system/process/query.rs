use serde_json::Value;

pub async fn query_server(port: u16, token: &str, path: &str) -> Result<Value, String> {
    let url = format!("http://127.0.0.1:{}{}", port, path);
    let client = crate::http_client::shared_client();
    let mut req = client
        .post(&url)
        .timeout(std::time::Duration::from_secs(5))
        .header("Content-Type", "application/json")
        .json(&Value::Null);
    if !token.is_empty() {
        req = req.header("X-CSRF-Token", token);
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    if res.status().is_success() {
        res.json::<Value>().await.map_err(|e| e.to_string())
    } else {
        Err(format!("HTTP status: {}", res.status()))
    }
}

pub async fn query_server_https(
    port: u16,
    token: &str,
    path: &str,
    body: Value,
) -> Result<Value, String> {
    let url = format!("https://127.0.0.1:{}{}", port, path);
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| e.to_string())?;
    let mut req = client
        .post(&url)
        .header("Content-Type", "application/json")
        .header("Connect-Protocol-Version", "1")
        .json(&body);
    if !token.is_empty() {
        req = req
            .header("X-Codeium-Csrf-Token", token)
            .header("X-CSRF-Token", token);
    }
    let res = match req.send().await {
        Ok(r) => r,
        Err(e) => return Err(e.to_string()),
    };
    if res.status().is_success() {
        res.json::<Value>()
            .await
            .map_err(|e| format!("APP_ERR: {}", e))
    } else {
        Err(format!("APP_ERR: HTTP status: {}", res.status()))
    }
}
