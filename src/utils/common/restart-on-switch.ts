/** Opt-in: restart running Antigravity/Codex apps after an account switch. */

export const RESTART_ON_SWITCH_KEY = "quotashift_restart_on_switch_v1";

type StorageReader = Pick<Storage, "getItem">;
type StorageWriter = Pick<Storage, "setItem">;

const defaultStorage = (): (StorageReader & StorageWriter) | null =>
  typeof localStorage !== "undefined" ? localStorage : null;

export function loadRestartOnSwitch(storage: StorageReader | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    return storage.getItem(RESTART_ON_SWITCH_KEY) === "true";
  } catch {
    return false;
  }
}

export function saveRestartOnSwitch(
  enabled: boolean,
  storage: StorageWriter | null = defaultStorage(),
): void {
  try {
    storage?.setItem(RESTART_ON_SWITCH_KEY, String(enabled));
  } catch {
    // Storage can be blocked; the in-memory toggle still applies for this session.
  }
}
