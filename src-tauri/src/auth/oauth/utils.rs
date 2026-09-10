use rand::Rng;
use sha2::{Digest, Sha256};

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
