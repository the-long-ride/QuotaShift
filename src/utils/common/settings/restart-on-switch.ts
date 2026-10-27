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

export type RestartProvider = "antigravity" | "codex";

/** Confirmation text for applying an account. Spells out what a restart touches. */
export function buildApplyDialogMessage(
  provider: RestartProvider,
  accountName: string,
  restart: boolean,
): string {
  const head = `Applying "${accountName}"`;
  if (provider === "antigravity") {
    return restart
      ? `${head} will restart whatever Antigravity you have running: the IDE or desktop app is closed and reopened, and a running agy CLI is stopped and reopened in a new terminal window. Anything that is not running is left alone. Do you want to continue?`
      : `${head} will write the new credentials. Running Antigravity apps keep the old account until restarted. Do you want to continue?`;
  }
  return restart
    ? `${head} will restart whatever Codex you have running: the ChatGPT/Codex desktop app is closed and reopened, while running Codex CLI sessions and IDE extension processes are stopped (run codex resume or reload the IDE window afterwards). Anything that is not running is left alone. Do you want to continue?`
    : `${head} will write the new credentials without touching running Codex apps. Do you want to continue?`;
}
