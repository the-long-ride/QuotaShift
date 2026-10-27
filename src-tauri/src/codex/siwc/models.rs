use serde_json::Value;
use std::collections::HashSet;

pub const SIWC_MODELS_ENDPOINT: &str = "https://api.openai.com/v1/models";

/// A model visible to this *specific authorized SIWC registration*.
/// It is not an entitlement inferred from a legacy Codex CLI model scan.
#[derive(Clone, Debug, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiwcModelView {
    pub slug: String,
    pub display_name: String,
}

pub fn parse_siwc_model_catalog(body: &Value) -> Result<Vec<SiwcModelView>, String> {
    let models = body
        .get("models")
        .and_then(Value::as_array)
        .ok_or("SIWC catalog response must contain a models array")?;
    if models.len() > 10_000 {
        return Err("SIWC model catalog exceeds accepted size".into());
    }
    let mut seen = HashSet::new();
    let mut result = Vec::new();
    for model in models {
        let obj = model.as_object().ok_or("Malformed SIWC model entry")?;
        if obj.get("visibility").and_then(Value::as_str) != Some("list") {
            continue;
        }
        let slug = obj
            .get("slug")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty() && text.len() <= 160)
            .ok_or("Listed SIWC model missing valid slug")?;
        let display_name = obj
            .get("display_name")
            .and_then(Value::as_str)
            .filter(|text| !text.is_empty() && text.len() <= 200)
            .ok_or("Listed SIWC model missing valid display_name")?;
        if seen.insert(slug.to_owned()) {
            result.push(SiwcModelView {
                slug: slug.to_owned(),
                display_name: display_name.to_owned(),
            });
        }
    }
    Ok(result)
}

/// Never call with a legacy Codex token. The caller must obtain this bearer
/// from the native, verified SIWC registration broker after scope checks.
pub async fn fetch_siwc_models(
    client: &reqwest::Client,
    siwc_bearer: &str,
) -> Result<Vec<SiwcModelView>, String> {
    if siwc_bearer.trim().is_empty() {
        return Err("Missing SIWC authorization".into());
    }
    let response = client
        .get(SIWC_MODELS_ENDPOINT)
        .bearer_auth(siwc_bearer)
        .send()
        .await
        .map_err(|_| "SIWC model request failed".to_string())?;
    if !response.status().is_success() {
        return Err(format!(
            "SIWC model catalog returned HTTP {}",
            response.status()
        ));
    }
    let body: Value = response
        .json()
        .await
        .map_err(|_| "Invalid SIWC model catalog JSON".to_string())?;
    parse_siwc_model_catalog(&body)
}
