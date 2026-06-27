use crate::types::{FullStatus, QuotaData};
use serde_json::Value;

pub(crate) async fn fetch_google_cloud_quota(
    access_token: &str,
    project_id: &str,
    service_name: &str,
) -> Result<FullStatus, String> {
    eprintln!("[gcloud_quota] fetch_google_cloud_quota: project_id={}, service={}, token_prefix={}",
        project_id, service_name, &access_token[..access_token.len().min(12)]);
    let project_number = resolve_project_number(access_token, project_id).await?;
    eprintln!("[gcloud_quota] resolved project_number={}", project_number);

    let limits = fetch_quota_limits(access_token, &project_number, service_name).await?;
    eprintln!("[gcloud_quota] got {} quota limits", limits.len());

    let usage = fetch_quota_usage(access_token, project_id, service_name).await?;
    eprintln!("[gcloud_quota] got {} usage entries", usage.len());

    Ok(build_full_status(limits, usage, service_name))
}

async fn resolve_project_number(access_token: &str, project_id: &str) -> Result<String, String> {
    let client = reqwest::Client::builder()
        .user_agent("QuotaShift")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://cloudresourcemanager.googleapis.com/v1/projects/{}",
        project_id
    );

    let resp = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to resolve project {}: {}", project_id, e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!(
            "Failed to resolve project {}: HTTP {} — verify project ID and permissions",
            project_id, status
        ));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse project response: {}", e))?;

    body.get("projectNumber")
        .and_then(|v| v.as_str().or_else(|| v.as_i64().map(|_| "")))
        .or_else(|| {
            body.get("projectNumber").and_then(|v| {
                let n = v.as_i64()?;
                Some(Box::leak(n.to_string().into_boxed_str()) as &str)
            })
        })
        .map(|s| s.to_string())
        .ok_or_else(|| format!("Could not find projectNumber in response for project {}", project_id))
}

async fn fetch_quota_limits(
    access_token: &str,
    project_number: &str,
    service_name: &str,
) -> Result<Vec<QuotaLimit>, String> {
    let client = reqwest::Client::builder()
        .user_agent("QuotaShift")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!(
        "https://serviceusage.googleapis.com/v1beta1/projects/{}/services/{}/consumerQuotaMetrics?view=FULL",
        project_number, service_name
    );

    let resp = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Service Usage API error: {}", e))?;

    if resp.status() == 403 {
        return Err(
            "Service Usage API: 403 — ensure serviceusage.googleapis.com is enabled and account has serviceusage.quotas.get permission"
                .to_string(),
        );
    }
    if !resp.status().is_success() {
        let status = resp.status();
        return Err(format!("Service Usage API: HTTP {}", status));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse quota limits: {}", e))?;

    let mut limits = Vec::new();

    if let Some(metrics) = body
        .get("consumerQuotaMetrics")
        .or_else(|| body.get("metrics"))
        .and_then(|v| v.as_array())
    {
        for metric in metrics {
            let metric_name = metric
                .get("metric")
                .or_else(|| metric.get("name"))
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");

            let display_name = metric
                .get("displayName")
                .and_then(|v| v.as_str())
                .unwrap_or(metric_name);

            if let Some(quota_limits) = metric.get("consumerQuotaLimits").and_then(|v| v.as_array()) {
                for limit in quota_limits {
                    let unit = limit.get("unit").and_then(|v| v.as_str()).unwrap_or("count");
                    let metric_path = limit.get("name").and_then(|v| v.as_str()).unwrap_or("");
                    let limit_name = metric_path.rsplit('/').next().unwrap_or(metric_name);

                    let effective_limit = limit
                        .get("defaultLimit")
                        .or_else(|| limit.get("overrideValue"))
                        .and_then(|v| v.as_str().unwrap_or("0").parse::<u64>().ok())
                        .unwrap_or(0u64);

                    limits.push(QuotaLimit {
                        metric: metric_name.to_string(),
                        limit_name: limit_name.to_string(),
                        display_name: display_name.to_string(),
                        effective_limit,
                        _unit: unit.to_string(),
                    });
                }
            }
        }
    }

    if limits.is_empty() {
        return Err(format!("No quota limits found for service {}", service_name));
    }

    Ok(limits)
}

async fn fetch_quota_usage(
    access_token: &str,
    project_id: &str,
    service_name: &str,
) -> Result<Vec<QuotaUsage>, String> {
    let client = reqwest::Client::builder()
        .user_agent("QuotaShift")
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let now = chrono::Utc::now();
    let start = (now - chrono::Duration::days(1)).format("%Y-%m-%dT%H:%M:%SZ").to_string();
    let end = now.format("%Y-%m-%dT%H:%M:%SZ").to_string();

    let filter = format!(
        "metric.type%3D%22serviceruntime.googleapis.com%2Fquota%2Fratev2%2Fnet_usage%22%20AND%20resource.type%3D%22consumer_quota%22%20AND%20resource.label.service%3D%22{}%22",
        service_name
    );

    let url = format!(
        "https://monitoring.googleapis.com/v3/projects/{}/timeSeries?filter={}&interval.startTime={}&interval.endTime={}",
        project_id, filter, start, end
    );

    let resp = client
        .get(&url)
        .bearer_auth(access_token)
        .send()
        .await
        .map_err(|e| format!("Cloud Monitoring API error: {}", e))?;

    if resp.status() == 403 {
        return Err(format!(
            "Cloud Monitoring API: 403 — ensure monitoring.googleapis.com is enabled and account has monitoring.timeSeries.list permission"
        ));
    }
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Cloud Monitoring API: HTTP {} — {}", status, text));
    }

    let body: Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse monitoring response: {}", e))?;

    let mut usage = Vec::new();

    if let Some(series) = body.get("timeSeries").and_then(|v| v.as_array()) {
        for ts in series {
            let metric_labels = ts.get("metric").and_then(|v| v.get("labels")).unwrap_or(&Value::Null);
            let quota_metric = metric_labels
                .get("quota_metric")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            let limit_name = metric_labels
                .get("limit_name")
                .and_then(|v| v.as_str())
                .unwrap_or("");

            if let Some(points) = ts.get("points").and_then(|v| v.as_array()) {
                let total_used: f64 = points
                    .iter()
                    .filter_map(|p| {
                        p.get("value")
                            .and_then(|v| {
                                v.get("int64Value")
                                    .or_else(|| v.get("doubleValue"))
                                    .and_then(|val| val.as_f64())
                            })
                    })
                    .sum();

                usage.push(QuotaUsage {
                    quota_metric: quota_metric.to_string(),
                    limit_name: limit_name.to_string(),
                    total_used: total_used as u64,
                });
            }
        }
    }

    Ok(usage)
}

#[derive(Debug, Clone)]
struct QuotaLimit {
    metric: String,
    limit_name: String,
    display_name: String,
    effective_limit: u64,
    _unit: String,
}

#[derive(Debug, Clone)]
struct QuotaUsage {
    quota_metric: String,
    limit_name: String,
    total_used: u64,
}

fn build_full_status(
    limits: Vec<QuotaLimit>,
    usage: Vec<QuotaUsage>,
    service_name: &str,
) -> FullStatus {
    let mut quotas = Vec::new();

    for limit in &limits {
        let used = usage
            .iter()
            .filter(|u| u.limit_name == limit.limit_name || u.quota_metric == limit.metric)
            .map(|u| u.total_used)
            .next()
            .unwrap_or(0);

        let five_hour_percent = if limit.effective_limit > 0 {
            ((((limit.effective_limit.saturating_sub(used)) as f64 / limit.effective_limit as f64) * 100.0)
                .round() as u32)
                .clamp(0, 100)
        } else {
            100
        };

        quotas.push(QuotaData {
            model: format!("{} ({})", limit.display_name, limit.limit_name),
            percent: five_hour_percent,
            refresh_time: "Ready".to_string(),
            five_hour_percent,
            five_hour_reset: "—".to_string(),
            five_hour_disabled: false,
            weekly_percent: five_hour_percent,
            weekly_reset: "—".to_string(),
            weekly_disabled: false,
        });
    }

    if quotas.is_empty() {
        quotas.push(QuotaData {
            model: format!("{} — No limits found", service_name),
            percent: 100,
            refresh_time: "Ready".to_string(),
            five_hour_percent: 100,
            five_hour_reset: "—".to_string(),
            five_hour_disabled: false,
            weekly_percent: 100,
            weekly_reset: "—".to_string(),
            weekly_disabled: false,
        });
    }

    quotas.sort_by(|a, b| a.percent.cmp(&b.percent));

    FullStatus {
        credits: None,
        quotas,
        plan_tier: Some(format!("GCP Project Quota ({})", service_name)),
        recently_used_model: None,
        monitored_codex: None,
        email: None,
    }
}