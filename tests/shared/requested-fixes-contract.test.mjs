import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("Claude card actions use flex layout with vertically centered items", () => {
  const css = read("src/styles/claude/claude-accounts.css");
  assert.match(
    css,
    /\.claude-card-actions\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*6px;/s,
  );
});

test("visible Claude profiles retain idle usage polling while manual suspended refresh stays blocked", () => {
  const backend = read("src-tauri/src/claude/accounts.rs");
  const monitor = read("src/hooks/claude/useClaudeAccountMonitor.ts");
  const parent = read("src/hooks/claude/useClaudeMonitor.ts");

  assert.match(backend, /idle_poll_interval_secs:\s*Option<u64>/);
  assert.match(
    backend,
    /Some\(if fast_eligible\s*\{[\s\S]*fast_interval_secs[\s\S]*idle_interval_secs/s,
  );
  assert.match(
    backend,
    /scheduler\.request_profiles\([\s\S]*&idle_profiles,[\s\S]*idle_poll_interval_secs/s,
  );
  assert.match(backend, /if suspended \|\| target_account_id != account_id/);
  assert.match(monitor, /if \(!platformVisible\) return/);
  assert.match(monitor, /idlePollIntervalSecs/);
  assert.match(parent, /idlePollIntervalSecs,[\s\n]*trackedClaudeAccountId/);
});

test("Settings modal keeps a stable body below the 38px interactive title bar", () => {
  const css = read("src/styles/settings/settings-modal.css");
  assert.match(
    css,
    /\.settings-modal-overlay\s*\{[^}]*top:\s*38px;[^}]*height:\s*calc\(100% - 38px\);/s,
  );
  assert.match(css, /\.settings-modal-box\s*\{[^}]*height:\s*min\(460px, calc\(100vh - 62px\)\);/s);
  assert.match(css, /\.settings-modal-body\s*\{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;/s);
  assert.match(css, /\.settings-modal-content\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
});


test("all dialogs stay below the title bar and remain viewport-capped under zoom", () => {
  const modalCss = read("src/styles/shared/modals.css");
  const baseCss = read("src/styles/shared/base.css");

  assert.match(
    modalCss,
    /\.dialog-overlay\s*\{[^}]*top:\s*38px;[^}]*height:\s*calc\(100% - 38px\);/s,
  );
  assert.match(
    modalCss,
    /\.dialog-box\s*\{[^}]*max-width:\s*calc\(100vw - 32px\);[^}]*max-height:\s*calc\(100vh - 62px\);/s,
  );
  assert.match(
    modalCss,
    /\.dialog-box--account\s*\{[^}]*max-height:\s*calc\(100vh - 62px\);[^}]*overflow:\s*hidden;/s,
  );
  assert.match(
    baseCss,
    /body:has\(\.dialog-overlay\) \.app-header\s*\{[^}]*z-index:\s*10000;[^}]*box-shadow:/s,
  );
});

test("wrong backup import passphrase renders inline and does not use the error toast", () => {
  const backups = read("src/hooks/app/useAppBackups.ts");
  const modal = read("src/components/common/PassphraseModal.tsx");
  const appModals = read("src/components/app/AppModals.tsx");
  const css = read("src/styles/shared/modals.css");

  assert.match(backups, /setPassError\("Invalid passphrase or corrupted backup"\)/);
  assert.doesNotMatch(backups, /showToast\("Invalid passphrase or corrupted backup",\s*"error"\)/);
  assert.match(modal, /displayError && mode === "import"/);
  assert.match(modal, /className="passphrase-field-error"/);
  assert.match(modal, /onErrorClear\?\.\(\)/);
  assert.match(appModals, /error=\{passError\}/);
  assert.match(appModals, /onErrorClear=\{clearPassError\}/);
  assert.match(css, /\.passphrase-field-error\s*\{[^}]*color:\s*#dc2626;/s);
});

test("successful Apply persists Last used immediately for Antigravity and Codex", () => {
  const antigravity = read("src/hooks/antigravity/useAntigravityAccountOps.ts");
  const codex = read("src/hooks/codex/useCodexAccountOps.ts");

  assert.match(
    antigravity,
    /persistAntigravityLastUsed[\s\S]*markAccountLastUsed[\s\S]*saveAntigravityAccounts\(updated\)[\s\S]*setAntigravityAccounts\(updated\)/,
  );
  assert.match(
    antigravity,
    /setActiveAntigravityId\(acc\.id\)[\s\S]*persistAntigravityLastUsed\(acc\.id\)/,
  );
  assert.match(
    codex,
    /persistCodexLastUsed[\s\S]*markAccountLastUsed[\s\S]*saveCodexAccounts\(updated\)[\s\S]*setCodexAccounts\(updated\)/,
  );
  assert.match(
    codex,
    /setActiveCodexId\(acc\.id\)[\s\S]*persistCodexLastUsed\(acc\.id, Date\.now\(\)\)/,
  );
});

test("startup and every idle poll reconcile current local sessions into Last used", () => {
  const events = read("src/hooks/app/useAppEventListeners.ts");
  const helper = read("src/utils/account/current-session-last-used.ts");

  assert.match(events, /const reconcileCurrentSessionLastUsed = async/);
  assert.match(
    events,
    /void reconcileCurrentSessionLastUsed\(\);[\s\S]*const timer = window\.setInterval/s,
  );
  assert.match(
    events,
    /const refreshVisibleIdlePlatforms = \(\) => \{[\s\S]*void reconcileCurrentSessionLastUsed\(\)/s,
  );
  assert.match(events, /const updated = await syncCurrentSessionLastUsed\(\)/);
  assert.match(helper, /invoke\("read_antigravity_session"\)/);
  assert.match(helper, /findAntigravityAccountMatch/);
  assert.match(helper, /saveAntigravityAccounts\(updated\)/);
  assert.match(helper, /invoke\("read_codex_auth"\)/);
  assert.match(helper, /findCodexAccountMatch/);
  assert.match(helper, /saveCodexAccounts\(updated\)/);
});
