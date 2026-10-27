/// Formats an audit log message ensuring that sensitive tokens or secrets
/// are strictly redacted and never leaked to logs or stdout.
pub fn format_safe_audit_log(event: &str, account_id: &str, _secret_payload: &str) -> String {
    format!(
        "[SIWC-AUDIT] event={} account_id={} secret=[REDACTED]",
        event, account_id
    )
}
