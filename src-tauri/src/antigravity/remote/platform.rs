pub const ANTIGRAVITY_IDE_VERSION: &str = "2.11.0";
pub const ANTIGRAVITY_CLIENT_NAME: &str = "antigravity";

pub fn antigravity_ide_version() -> String {
    option_env!("QUOTASHIFT_AG_CLIENT_VERSION")
        .unwrap_or(ANTIGRAVITY_IDE_VERSION)
        .to_string()
}

pub fn mask_email(email: Option<&str>) -> String {
    let Some((local, domain)) = email.and_then(|value| value.trim().split_once('@')) else {
        return "account".to_string();
    };
    if local.is_empty() || domain.is_empty() {
        return "account".to_string();
    }
    let chars: Vec<char> = local.chars().collect();
    let head: String = chars.iter().take(2).collect();
    let tail_start = chars.len().saturating_sub(2).max(head.chars().count());
    let tail: String = chars.iter().skip(tail_start).collect();
    format!("{}***{}@{}", head, tail, domain)
}

pub fn platform_metadata() -> u8 {
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return 1;
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return 2;
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return 3;
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return 4;
    }
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return 5;
    }
    #[allow(unreachable_code)]
    0
}

pub fn platform_user_agent_segment() -> &'static str {
    #[cfg(all(target_os = "windows", target_arch = "x86_64"))]
    {
        return "windows/amd64";
    }
    #[cfg(all(target_os = "windows", target_arch = "aarch64"))]
    {
        return "windows/arm64";
    }
    #[cfg(all(target_os = "linux", target_arch = "x86_64"))]
    {
        return "linux/amd64";
    }
    #[cfg(all(target_os = "linux", target_arch = "aarch64"))]
    {
        return "linux/arm64";
    }
    #[cfg(all(target_os = "macos", target_arch = "x86_64"))]
    {
        return "darwin/amd64";
    }
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    {
        return "darwin/arm64";
    }
    #[allow(unreachable_code)]
    "unknown/unknown"
}
