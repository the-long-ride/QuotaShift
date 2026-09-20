pub(super) fn endpoint_name(url: &str) -> &'static str {
    if url.contains("loadCodeAssist") {
        "loadCodeAssist"
    } else if url.contains("retrieveUserQuotaSummary") {
        "retrieveUserQuotaSummary"
    } else if url.contains("fetchAvailableModels") {
        "fetchAvailableModels"
    } else {
        "request"
    }
}

pub(super) fn format_http_failure_log(
    identity: &str,
    endpoint: &str,
    status: u16,
) -> Option<String> {
    if (200..300).contains(&status) {
        return None;
    }
    Some(format!(
        "[antigravity_remote] {identity} {endpoint} {status}"
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn successful_http_statuses_do_not_emit_remote_log_lines() {
        assert_eq!(
            format_http_failure_log("ca***vn@gmail.com", "loadCodeAssist", 200),
            None
        );
        assert_eq!(
            format_http_failure_log("ca***vn@gmail.com", "retrieveUserQuotaSummary", 204),
            None
        );
    }

    #[test]
    fn failed_http_statuses_keep_masked_remote_diagnostics() {
        assert_eq!(
            format_http_failure_log("ca***vn@gmail.com", "retrieveUserQuotaSummary", 401),
            Some("[antigravity_remote] ca***vn@gmail.com retrieveUserQuotaSummary 401".to_string())
        );
    }

    #[test]
    fn endpoint_names_remain_stable_for_failure_logs() {
        assert_eq!(
            endpoint_name("https://example/v1internal:loadCodeAssist"),
            "loadCodeAssist"
        );
        assert_eq!(
            endpoint_name("https://example/v1internal:retrieveUserQuotaSummary"),
            "retrieveUserQuotaSummary"
        );
        assert_eq!(
            endpoint_name("https://example/v1internal:fetchAvailableModels"),
            "fetchAvailableModels"
        );
    }
}
