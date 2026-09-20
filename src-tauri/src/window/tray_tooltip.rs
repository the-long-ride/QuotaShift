use crate::types::{FullStatus, MonitoredTrayInfo, MonitoredTrayQuotaRow};

fn provider_label(provider: &str) -> &str {
    match provider {
        "claude" => "Claude",
        "codex" => "Codex",
        "antigravity" => "Antigravity",
        _ => "QuotaShift",
    }
}

fn usage_label(label: &str) -> Option<&'static str> {
    match label.trim().to_ascii_lowercase().as_str() {
        "5h" | "5hr" | "5hrs" | "5-hour" | "5 hour" | "5 hours" | "primary"
        | "primary / session" => Some("5 hours"),
        "wk" | "week" | "weekly" | "secondary" | "secondary / weekly" => Some("Weekly"),
        "mo" | "month" | "monthly" => Some("Monthly"),
        _ => None,
    }
}

fn format_usage_line(label: &str, percent: Option<u32>) -> Option<String> {
    Some(format!("{}: {}%", usage_label(label)?, percent?,))
}

fn format_percent(value: Option<u32>) -> String {
    value
        .map(|percent| format!("{percent}%"))
        .unwrap_or_else(|| "—".to_string())
}

fn format_antigravity_row(
    label: &str,
    five_hour_percent: Option<u32>,
    weekly_percent: Option<u32>,
) -> String {
    format!(
        "{label}: 5HR - {} | WK - {}",
        format_percent(five_hour_percent),
        format_percent(weekly_percent)
    )
}

fn find_antigravity_row<'a>(
    rows: &'a [MonitoredTrayQuotaRow],
    family: &str,
) -> Option<&'a MonitoredTrayQuotaRow> {
    rows.iter().find(|row| {
        let label = row.label.to_ascii_lowercase();
        match family {
            "gemini" => label.contains("gemini"),
            "third_party" => {
                label.contains("claude") || label.contains("openai") || label.contains("open_ai")
            }
            _ => false,
        }
    })
}

fn format_antigravity_rows(rows: &[MonitoredTrayQuotaRow]) -> Vec<String> {
    let gemini = find_antigravity_row(rows, "gemini");
    let third_party = find_antigravity_row(rows, "third_party");

    vec![
        format_antigravity_row(
            "Gemini",
            gemini.and_then(|row| row.five_hour_percent),
            gemini.and_then(|row| row.weekly_percent),
        ),
        format_antigravity_row(
            "Others",
            third_party.and_then(|row| row.five_hour_percent),
            third_party.and_then(|row| row.weekly_percent),
        ),
    ]
}

fn format_status_tooltip(status: &FullStatus) -> String {
    if let Some(codex) = &status.monitored_codex {
        let mut lines = vec!["Codex".to_string()];
        lines.extend(
            [
                format_usage_line(&codex.primary_label, codex.primary_percent),
                format_usage_line(&codex.secondary_label, codex.secondary_percent),
            ]
            .into_iter()
            .flatten(),
        );
        return lines.join("\n");
    }

    let gemini = status
        .quotas
        .iter()
        .find(|q| q.model.contains("Gemini") || q.model.to_lowercase().contains("google"));
    let third_party = status.quotas.iter().find(|q| {
        q.model.contains("Claude")
            || q.model.contains("OpenAI")
            || q.model.to_lowercase().contains("gpt")
    });

    [
        "Antigravity".to_string(),
        format_antigravity_row(
            "Gemini",
            gemini.and_then(|q| q.five_hour_percent),
            gemini.and_then(|q| q.weekly_percent),
        ),
        format_antigravity_row(
            "Others",
            third_party.and_then(|q| q.five_hour_percent),
            third_party.and_then(|q| q.weekly_percent),
        ),
    ]
    .join("\n")
}

fn format_monitored_tray(info: &MonitoredTrayInfo) -> String {
    let mut lines = vec![provider_label(&info.provider).to_string()];

    if info.provider == "antigravity" {
        lines.extend(format_antigravity_rows(&info.quota_rows));
        return lines.join("\n");
    }

    lines.extend(
        info.single_bars
            .iter()
            .filter_map(|bar| format_usage_line(&bar.label, bar.percent)),
    );
    lines.join("\n")
}

pub fn format_tooltip_with_monitored(
    status: &FullStatus,
    monitored_tray: Option<&MonitoredTrayInfo>,
) -> String {
    monitored_tray
        .map(format_monitored_tray)
        .unwrap_or_else(|| format_status_tooltip(status))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{
        CodexMonitoredInfo, MonitoredTrayBar, MonitoredTrayInfo, MonitoredTrayQuotaRow,
    };

    fn empty_status() -> FullStatus {
        FullStatus {
            credits: None,
            quotas: Vec::new(),
            plan_tier: None,
            recently_used_model: None,
            monitored_codex: None,
            email: None,
            online: true,
            source: None,
            accuracy: None,
        }
    }

    #[test]
    fn claude_tooltip_shows_only_named_usage_windows() {
        let info = MonitoredTrayInfo {
            provider: "claude".to_string(),
            single_bars: vec![
                MonitoredTrayBar {
                    label: "5H".to_string(),
                    percent: Some(87),
                },
                MonitoredTrayBar {
                    label: "WK".to_string(),
                    percent: Some(64),
                },
                MonitoredTrayBar {
                    label: "CTX".to_string(),
                    percent: Some(44),
                },
                MonitoredTrayBar {
                    label: "monthly".to_string(),
                    percent: None,
                },
            ],
            quota_rows: Vec::new(),
        };

        assert_eq!(
            format_tooltip_with_monitored(&empty_status(), Some(&info)),
            "Claude\n5 hours: 87%\nWeekly: 64%"
        );
    }

    #[test]
    fn codex_tooltip_uses_full_usage_window_names() {
        let info = MonitoredTrayInfo {
            provider: "codex".to_string(),
            single_bars: vec![
                MonitoredTrayBar {
                    label: "5H".to_string(),
                    percent: Some(91),
                },
                MonitoredTrayBar {
                    label: "weekly".to_string(),
                    percent: Some(72),
                },
                MonitoredTrayBar {
                    label: "monthly".to_string(),
                    percent: Some(55),
                },
            ],
            quota_rows: Vec::new(),
        };

        assert_eq!(
            format_tooltip_with_monitored(&empty_status(), Some(&info)),
            "Codex\n5 hours: 91%\nWeekly: 72%\nMonthly: 55%"
        );
    }

    #[test]
    fn antigravity_tooltip_keeps_grouped_rows() {
        let info = MonitoredTrayInfo {
            provider: "antigravity".to_string(),
            single_bars: Vec::new(),
            quota_rows: vec![
                MonitoredTrayQuotaRow {
                    label: "Gemini".to_string(),
                    five_hour_percent: Some(100),
                    weekly_percent: Some(83),
                },
                MonitoredTrayQuotaRow {
                    label: "OpenAI".to_string(),
                    five_hour_percent: Some(74),
                    weekly_percent: Some(61),
                },
            ],
        };

        assert_eq!(
            format_tooltip_with_monitored(&empty_status(), Some(&info)),
            "Antigravity\nGemini: 5HR - 100% | WK - 83%\nOthers: 5HR - 74% | WK - 61%"
        );
    }

    #[test]
    fn legacy_codex_status_uses_full_usage_window_names() {
        let mut status = empty_status();
        status.monitored_codex = Some(CodexMonitoredInfo {
            account_id: "acct".to_string(),
            label: "hidden@example.com".to_string(),
            primary_percent: Some(80),
            primary_label: "5h".to_string(),
            secondary_percent: Some(60),
            secondary_label: "wk".to_string(),
        });

        assert_eq!(
            format_tooltip_with_monitored(&status, None),
            "Codex\n5 hours: 80%\nWeekly: 60%"
        );
    }
}
