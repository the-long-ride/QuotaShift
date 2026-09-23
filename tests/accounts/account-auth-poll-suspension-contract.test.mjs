import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("automatic poll cycles skip accounts suspended for re-authentication", () => {
  const codex = fs.readFileSync("src/hooks/codex/useCodexUsageFetcher.ts", "utf8");
  const antigravity = fs.readFileSync("src/utils/antigravity/app-antigravity-ops.ts", "utf8");
  const listeners = fs.readFileSync("src/hooks/app/useAppEventListeners.ts", "utf8");
  const bootstrap = fs.readFileSync("src/hooks/app/useAppSessionBootstrap.ts", "utf8");

  assert.match(codex, /!force\s*&&\s*isAccountPollingSuspended\("codex", account\.id\)/);
  assert.match(codex, /suspendAccountPolling\("codex", account\.id\)/);
  assert.match(antigravity, /!force\s*&&\s*isAccountPollingSuspended\("antigravity", acc\.id\)/);
  assert.match(antigravity, /suspendAccountPolling\("antigravity", acc\.id\)/);
  assert.match(antigravity, /!isAccountPollingSuspended\("antigravity", account\.id\)/);
  assert.match(
    listeners,
    /refreshAntigravityAccountsCloudFirst\(loadAntigravityAccounts\(\), false\)/,
  );
  assert.match(bootstrap, /refreshAntigravityAccountsCloudFirst\(agAccounts, false\)/);
});

test("re-authenticated accounts are resumed before their first forced refresh", () => {
  const modals = fs.readFileSync("src/components/app/AppModals.tsx", "utf8");

  assert.match(
    modals,
    /onAccountAdded=\{async \(id\) => \{\s*resumeAccountPolling\("antigravity", id\)/s,
  );
  assert.match(
    modals,
    /onStartFetching=\{\(id, isOAuth\) => \{\s*resumeAccountPolling\("codex", id\)/s,
  );
});

test("re-authenticate action remains visible while an account is poll-suspended", () => {
  const codex = fs.readFileSync("src/components/codex/CodexAccountCard.tsx", "utf8");
  const antigravity = fs.readFileSync(
    "src/components/antigravity/AntigravityAccountActions.tsx",
    "utf8",
  );

  assert.match(codex, /isAccountPollingSuspended\("codex", acc\.id\)/);
  assert.match(antigravity, /isAccountPollingSuspended\("antigravity", account\.id\)/);
});
