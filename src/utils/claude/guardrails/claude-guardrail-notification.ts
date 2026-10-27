import { invoke } from "@tauri-apps/api/core";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

/**
 * Sends a native OS desktop notification with QuotaShift application branding and icon.
 * Bypasses PowerShell workarounds on Windows via WinRT and registered AUMID.
 */
export async function sendDesktopNotification(title: string, body: string): Promise<void> {
  try {
    await invoke("show_desktop_notification", { title, body });
    return;
  } catch (error) {
    console.warn("Native desktop notification failed, falling back to plugin:", error);
  }

  let allowed = await isPermissionGranted();
  if (!allowed) {
    allowed = (await requestPermission()) === "granted";
  }
  if (allowed) {
    sendNotification({ title, body });
  }
}

export async function notifyClaudeGuardrailSuspension(title: string, body: string): Promise<void> {
  await sendDesktopNotification(title, body);
}
