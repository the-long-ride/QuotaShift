export type AppToastKind = "info" | "success" | "warning" | "error";

export const APP_TOAST_EVENT = "quotashift-toast";

export interface AppToastDetail {
  message: string;
  kind?: AppToastKind;
}

export function showAppToast(message: string, kind: AppToastKind = "info") {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(
      new CustomEvent<AppToastDetail>(APP_TOAST_EVENT, {
        detail: { message, kind },
      }),
    );
  }
}
