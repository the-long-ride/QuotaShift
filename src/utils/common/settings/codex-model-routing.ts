/**
 * Opt-in: Enable Codex Model Pool routing in ChatGPT Codex tab and Claude tab.
 * When OFF:
 * - ChatGPT Codex tab only displays the accounts list (no subtabs).
 * - Codex account cards do not display the Model Routing authorization row.
 * - Claude tab does not display the "Connect to QuotaShift" button.
 */

export const CODEX_MODEL_ROUTING_KEY = "quotashift_codex_model_routing_v1";
export const CODEX_MODEL_ROUTING_CHANGED_EVENT = "quotashift_codex_model_routing_changed";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const defaultStorage = (): (StorageReader & StorageWriter) | null =>
  typeof localStorage !== "undefined" ? localStorage : null;

export function loadCodexModelRoutingPreference(
  storage: StorageReader | null = defaultStorage(),
): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(CODEX_MODEL_ROUTING_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveCodexModelRoutingPreference(
  enabled: boolean,
  storage: StorageWriter | null = defaultStorage(),
): void {
  try {
    storage?.setItem(CODEX_MODEL_ROUTING_KEY, String(enabled));
  } catch {
    // Storage can be blocked; in-memory toggle still applies for this session.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(CODEX_MODEL_ROUTING_CHANGED_EVENT, { detail: { enabled } }),
    );
  }
}
