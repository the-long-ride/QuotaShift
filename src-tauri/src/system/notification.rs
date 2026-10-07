//! Cross-platform native notification system for QuotaShift.
//!
//! On Windows:
//! Ensures QuotaShift's AppUserModelID is registered under
//! `HKCU\Software\Classes\AppUserModelId\com.thelongride.quotashift` with
//! display name "QuotaShift" and the bundled QuotaShift app icon. Toast notifications
//! are sent directly via WinRT with Short duration, ensuring
//! Windows properly identifies QuotaShift as the sender with its own icon in the header.
//!
//! On macOS and Linux:
//! Dispatches native desktop notifications via the system notification daemon,
//! preserving "QuotaShift" app identity.

use std::path::PathBuf;

pub const APP_USER_MODEL_ID: &str = "com.thelongride.quotashift";
pub const APP_DISPLAY_NAME: &str = "QuotaShift";

/// Writes the bundled 128x128 PNG icon to disk if it does not already exist,
/// returning the path for Windows notification registration and toast icon display.
pub fn ensure_notification_icon_file() -> Option<PathBuf> {
    let home = crate::system::session::get_home_dir()?;
    let dir = home.join(".quotashift");
    if !dir.exists() {
        let _ = std::fs::create_dir_all(&dir);
    }
    let icon_path = dir.join("quotashift-notification-icon.png");
    if !icon_path.exists() || icon_path.metadata().map(|m| m.len() == 0).unwrap_or(true) {
        let bytes = include_bytes!("../../icons/128x128.png");
        let _ = std::fs::write(&icon_path, bytes);
    }
    Some(icon_path)
}

/// Registers the QuotaShift AppUserModelId in the current user's registry hive on Windows.
/// This associates the AUMID with "QuotaShift" and the app icon for WinRT notifications.
#[cfg(target_os = "windows")]
pub fn register_app_user_model_id() -> Result<(), String> {
    use winreg::enums::{HKEY_CURRENT_USER, KEY_SET_VALUE};
    use winreg::RegKey;

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let subkey_path = format!(r"Software\Classes\AppUserModelId\{APP_USER_MODEL_ID}");
    let (key, _) = hkcu
        .create_subkey_with_flags(&subkey_path, KEY_SET_VALUE)
        .map_err(|e| format!("Failed to create AUMID registry key: {e}"))?;

    key.set_value("DisplayName", &APP_DISPLAY_NAME)
        .map_err(|e| format!("Failed to set DisplayName: {e}"))?;

    if let Some(icon_path) = ensure_notification_icon_file() {
        let icon_str = icon_path.to_string_lossy().to_string();
        let _ = key.set_value("IconUri", &icon_str);
    }

    let show_in_settings: u32 = 1;
    let _ = key.set_value("ShowInSettings", &show_in_settings);

    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn register_app_user_model_id() -> Result<(), String> {
    Ok(())
}

/// Initializes native notification support during application startup.
pub fn init() {
    let _ = ensure_notification_icon_file();
    #[cfg(target_os = "windows")]
    {
        if let Err(e) = register_app_user_model_id() {
            crate::logger::log_warn("notification", &format!("Could not register AUMID: {e}"));
        }
    }
}

/// Shows a native OS desktop notification with QuotaShift identity and icon.
pub fn show_native_notification(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        let _ = register_app_user_model_id();

        let toast = tauri_winrt_notification::Toast::new(APP_USER_MODEL_ID)
            .title(title)
            .text1(body)
            .duration(tauri_winrt_notification::Duration::Short);

        match toast.show() {
            Ok(_) => Ok(()),
            Err(e) => {
                crate::logger::log_warn(
                    "notification",
                    &format!("WinRT toast show failed: {e:?}, falling back to Tauri plugin"),
                );
                use tauri_plugin_notification::NotificationExt;
                app.notification()
                    .builder()
                    .title(title)
                    .body(body)
                    .show()
                    .map_err(|err| format!("Fallback notification failed: {err}"))
            }
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        use tauri_plugin_notification::NotificationExt;
        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|err| format!("Failed to show notification: {err}"))
    }
}
