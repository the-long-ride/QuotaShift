export const CODEX_ACCOUNTS_KEY = "antigravity-codex-accounts";
export const CODEX_ACTIVE_ID_KEY = "antigravity-codex-active-id";
export const CODEX_ORDER_KEY = "antigravity-codex-account-order";
export const CODEX_POOLS_KEY = "quotashift_codex_account_pools_v1";
export const CODEX_ACTIVE_POOL_ID_KEY = "quotashift_codex_active_pool_id_v1";
export const CODEX_MODEL_CATALOG_STORAGE_KEY = "quotashift_codex_model_catalog_v1";
export const CODEX_POOL_ROUTING_KEY = "quotashift_codex_pool_routing_v1";
export const ANTIGRAVITY_ACCOUNTS_KEY = "antigravity-accounts-list";
export const ANTIGRAVITY_ACTIVE_ID_KEY = "antigravity-active-id";
export const ANTIGRAVITY_ORDER_KEY = "antigravity-account-order";
export const OVERLAY_TRACKED_PROVIDER_KEY = "quotashift_overlay_tracked_provider";
export const OVERLAY_TRACKED_ACCOUNT_ID_KEY = "quotashift_overlay_tracked_account_id";
export const THEME_KEY = "antigravity-theme";
export const KEEP_ALIVE_KEY = "keepAliveActive";
export const OVERLAY_ENABLED_KEY = "quotashift_overlay_enabled";
export const OFFICIAL_RELEASE_URL = "https://github.com/the-long-ride/QuotaShift/releases/latest";

export const resolveAntigravityPlanName = (raw: string | null | undefined): string | null => {
  if (!raw) return null;
  const lower = raw.toLowerCase().trim();
  if (lower === "free-tier" || lower === "free") return "Free";
  if (lower === "standard-tier" || lower === "standard") return "Paid";
  if (lower === "legacy-tier" || lower === "legacy") return "Legacy";
  if (
    lower === "advanced-tier" ||
    lower === "advanced" ||
    lower === "google_ai_pro" ||
    lower === "google-ai-pro" ||
    lower === "ai-pro"
  )
    return "Google AI Pro";
  if (
    lower === "ultra-tier" ||
    lower === "ultra" ||
    lower === "google_ai_ultra" ||
    lower === "google-ai-ultra" ||
    lower === "ai-ultra"
  )
    return "Google AI Ultra";
  if (raw.startsWith("GCP Project Quota")) return null;
  if (raw.includes(" ")) return raw;
  return raw.charAt(0).toUpperCase() + raw.slice(1);
};

export interface DialogState {
  message: string;
  isConfirm: boolean;
  resolve: (value: boolean) => void;
}
