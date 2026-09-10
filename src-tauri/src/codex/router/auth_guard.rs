use axum::http::{HeaderMap, HeaderName, HeaderValue};
use std::net::IpAddr;

use crate::codex_sync::ROUTER_AUTH_HEADER;

pub fn should_forward_request_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str(),
        "authorization"
            | "origin"
            | "chatgpt-account-id"
            | "host"
            | "x-forwarded-for"
            | "x-forwarded-host"
            | "x-forwarded-proto"
            | "x-quotashift-token"
            | "content-length"
            | "connection"
            | "transfer-encoding"
            | "upgrade"
    )
}

pub fn should_forward_response_header(name: &HeaderName) -> bool {
    !matches!(
        name.as_str(),
        "content-length" | "connection" | "transfer-encoding" | "upgrade"
    )
}

pub fn constant_time_equal(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (left_byte, right_byte) in left.iter().zip(right) {
        difference |= left_byte ^ right_byte;
    }
    difference == 0
}

pub fn expected_local_authority(authority: &str, expected_host: &str) -> bool {
    let authority = authority.trim();
    if authority.is_empty() || authority.contains('/') || authority.contains('@') {
        return false;
    }

    let Some((expected_address, expected_port)) = expected_host.rsplit_once(':') else {
        return false;
    };
    let Some((address, port)) = authority.rsplit_once(':') else {
        return false;
    };
    if port != expected_port || address.contains(':') {
        return false;
    }

    let address = address.trim_matches(|character| character == '[' || character == ']');
    let Ok(ip) = address.parse::<IpAddr>() else {
        return address.eq_ignore_ascii_case("localhost")
            && expected_address.eq_ignore_ascii_case("127.0.0.1");
    };
    ip == IpAddr::V4(std::net::Ipv4Addr::LOCALHOST) && expected_address == "127.0.0.1"
}

pub fn single_header<'a>(headers: &'a HeaderMap, name: &str) -> Option<&'a HeaderValue> {
    let mut values = headers.get_all(name).iter();
    let first = values.next()?;
    values.next().is_none().then_some(first)
}

pub fn trusted_request_origin_and_host(headers: &HeaderMap, expected_host: &str) -> bool {
    let Some(host) = single_header(headers, "host").and_then(|value| value.to_str().ok()) else {
        return false;
    };
    if !expected_local_authority(host, expected_host) {
        return false;
    }

    let mut origins = headers.get_all("origin").iter();
    let Some(origin) = origins.next() else {
        return true;
    };
    if origins.next().is_some() {
        return false;
    }
    let Ok(origin) = origin.to_str() else {
        return false;
    };
    let Some((scheme, authority)) = origin.split_once("://") else {
        return false;
    };
    if !matches!(scheme.to_ascii_lowercase().as_str(), "http" | "https") {
        return false;
    }
    expected_local_authority(authority, expected_host)
}

pub fn has_valid_router_secret(headers: &HeaderMap, expected_secret: &[u8]) -> bool {
    if headers.get_all(ROUTER_AUTH_HEADER).iter().nth(1).is_some()
        || headers.get_all("authorization").iter().nth(1).is_some()
    {
        return false;
    }
    let custom = single_header(headers, ROUTER_AUTH_HEADER);
    let authorization = single_header(headers, "authorization");
    if let Some(value) = custom {
        return constant_time_equal(value.as_bytes(), expected_secret);
    }
    let Some(value) = authorization else {
        return false;
    };
    let bytes = value.as_bytes();
    if bytes.len() < 7 {
        return false;
    }
    let (scheme, token) = bytes.split_at(7);
    scheme.eq_ignore_ascii_case(b"Bearer ") && constant_time_equal(token, expected_secret)
}
