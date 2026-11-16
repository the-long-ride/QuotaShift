use rand::Rng;
use serde_json::Value;
use sha2::{Digest, Sha256};

const GOOGLE_TOKENINFO_URL: &str = "https://oauth2.googleapis.com/tokeninfo";

pub async fn fetch_tokeninfo_scope(client: &reqwest::Client, access_token: &str) -> Option<String> {
    let res = client
        .get(GOOGLE_TOKENINFO_URL)
        .query(&[("access_token", access_token)])
        .send()
        .await
        .ok()?;
    if !res.status().is_success() {
        return None;
    }
    let info: Value = res.json().await.ok()?;
    info.get("scope")
        .and_then(|v| v.as_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

pub fn apply_scope_audit(json: &mut Value, missing_scopes: &[&str]) {
    if let Some(obj) = json.as_object_mut() {
        obj.insert(
            "missingScopes".to_string(),
            Value::Array(
                missing_scopes
                    .iter()
                    .map(|s| Value::String((*s).to_string()))
                    .collect(),
            ),
        );
        obj.insert(
            "scopeAuditPassed".to_string(),
            Value::Bool(missing_scopes.is_empty()),
        );
    }
}

pub fn random_base64url(n: usize) -> String {
    let mut rng = rand::thread_rng();
    let bytes: Vec<u8> = (0..n).map(|_| rng.gen::<u8>()).collect();
    base64::Engine::encode(&base64::prelude::BASE64_URL_SAFE_NO_PAD, bytes)
}

pub fn pkce_challenge(verifier: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    base64::Engine::encode(&base64::prelude::BASE64_URL_SAFE_NO_PAD, hash)
}

pub fn pct_encode(s: &str) -> String {
    let mut result = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b == b'-' || b == b'_' || b == b'.' || b == b'~' {
            result.push(b as char);
        } else {
            result.push_str(&format!("%{:02X}", b));
        }
    }
    result
}

pub fn extract_callback_param(request: &str, param: &str) -> Option<String> {
    let first_line = request.lines().next()?;
    let path = first_line.split_whitespace().nth(1)?;
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.split('=');
        let k = parts.next()?;
        let v = parts.next().unwrap_or("");
        if k == param {
            let mut decoded = String::new();
            let mut chars = v.chars();
            while let Some(c) = chars.next() {
                if c == '%' {
                    let h1 = chars.next()?;
                    let h2 = chars.next()?;
                    let hex_str = format!("{}{}", h1, h2);
                    if let Ok(b) = u8::from_str_radix(&hex_str, 16) {
                        decoded.push(b as char);
                    }
                } else if c == '+' {
                    decoded.push(' ');
                } else {
                    decoded.push(c);
                }
            }
            return Some(decoded);
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::apply_scope_audit;
    use serde_json::json;

    #[test]
    fn apply_scope_audit_populates_missing_scopes_and_pass_flag() {
        let mut passed_json = json!({ "access_token": "tok" });
        apply_scope_audit(&mut passed_json, &[]);
        assert_eq!(passed_json["missingScopes"], json!([]));
        assert_eq!(passed_json["scopeAuditPassed"], json!(true));

        let mut failed_json = json!({ "access_token": "tok" });
        apply_scope_audit(&mut failed_json, &["https://www.googleapis.com/auth/cclog"]);
        assert_eq!(
            failed_json["missingScopes"],
            json!(["https://www.googleapis.com/auth/cclog"])
        );
        assert_eq!(failed_json["scopeAuditPassed"], json!(false));
    }
}
