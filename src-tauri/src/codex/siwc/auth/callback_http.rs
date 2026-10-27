//! Loopback HTTP request parsing and redirect helpers for SIWC callbacks.
use std::collections::HashMap;
use tokio::io::{AsyncReadExt, AsyncWriteExt};

pub(super) async fn read_callback_query(
    socket: &mut tokio::net::TcpStream,
    port: u16,
) -> Result<HashMap<String, String>, String> {
    let target = read_callback_target(socket, port).await?;
    let url = reqwest::Url::parse(&format!("http://127.0.0.1:{port}{target}"))
        .map_err(|_| "Invalid callback URL")?;
    if url.path() != "/auth/callback" {
        return Err("Unsupported callback request path".into());
    }
    let mut pairs = HashMap::<String, String>::new();
    for (key, value) in url.query_pairs() {
        if pairs.insert(key.to_string(), value.to_string()).is_some() {
            return Err("Duplicate callback parameter".into());
        }
    }
    Ok(pairs)
}

/// Reads complete HTTP headers, even when the browser splits a request across TCP packets.
pub(super) async fn read_callback_target(
    socket: &mut tokio::net::TcpStream,
    port: u16,
) -> Result<String, String> {
    let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(4);
    let mut bytes = Vec::new();
    loop {
        if let Some(end) = bytes.windows(4).position(|chunk| chunk == b"\r\n\r\n") {
            return parse_callback_head(&bytes[..end], port);
        }
        if bytes.len() >= 8192 {
            return Err("Oversized OAuth callback request".into());
        }
        let mut chunk = [0u8; 1024];
        let count = tokio::time::timeout_at(deadline, socket.read(&mut chunk))
            .await
            .map_err(|_| "Incomplete OAuth callback")?
            .map_err(|_| "Cannot read OAuth callback")?;
        if count == 0 {
            return Err("Incomplete OAuth callback".into());
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
}

pub(super) fn parse_callback_head(bytes: &[u8], port: u16) -> Result<String, String> {
    let text = std::str::from_utf8(bytes).map_err(|_| "Invalid callback request")?;
    let mut lines = text.split("\r\n");
    let first = lines.next().ok_or("Missing callback request line")?;
    let target = first
        .strip_prefix("GET ")
        .and_then(|line| line.strip_suffix(" HTTP/1.1"))
        .ok_or("Unsupported callback request method")?;
    if !target.starts_with("/auth/callback?") || target.contains('#') {
        return Err("Unsupported callback request path".into());
    }
    let mut hosts = lines.filter_map(|line| {
        line.strip_prefix("Host: ")
            .or_else(|| line.strip_prefix("host: "))
    });
    let host = hosts.next().ok_or("Missing callback host")?;
    if hosts.next().is_some()
        || ![format!("127.0.0.1:{port}"), format!("localhost:{port}")]
            .iter()
            .any(|allowed| allowed.eq_ignore_ascii_case(host.trim()))
    {
        return Err("Untrusted callback host".into());
    }
    Ok(target.to_owned())
}

pub(super) fn redirect_response(location: &str) -> String {
    format!(
        "HTTP/1.1 302 Found\r\nLocation: {location}\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: 0\r\n\r\n"
    )
}

pub(super) async fn respond_redirect(
    socket: &mut tokio::net::TcpStream,
    location: &str,
) -> std::io::Result<()> {
    let response = redirect_response(location);
    socket.write_all(response.as_bytes()).await
}
