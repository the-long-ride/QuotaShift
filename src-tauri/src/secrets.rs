macro_rules! env {
    ($env_key:expr, $default:expr) => {
        match option_env!($env_key) {
            Some(v) => v,
            None => $default,
        }
    };
}

pub(crate) const AG_ORIGINAL_CLIENT_ID: &str =
    env!("QUOTASHIFT_AG_ORIGINAL_CLIENT_ID", "");

pub(crate) const AG_CONSUMER_CLIENT_ID: &str =
    env!("QUOTASHIFT_AG_CONSUMER_CLIENT_ID", "");

pub(crate) const AG_CONSUMER_CLIENT_SECRET: &str =
    env!("QUOTASHIFT_AG_CONSUMER_CLIENT_SECRET", "");

pub(crate) const AG_ENTERPRISE_CLIENT_ID: &str =
    env!("QUOTASHIFT_AG_ENTERPRISE_CLIENT_ID", "");

pub(crate) const AG_ENTERPRISE_CLIENT_SECRET: &str =
    env!("QUOTASHIFT_AG_ENTERPRISE_CLIENT_SECRET", "");

pub(crate) const CHATGPT_CLIENT_ID: &str =
    env!("QUOTASHIFT_CHATGPT_CLIENT_ID", "");
