import { useEffect, useRef, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { AntigravityAccount, AntigravityUsageCacheEntry, CodexAccount } from "../../utils/common/types";
import { loadCliRotationBindings, loadCliRotationPools } from "../../utils/common/backup/app-storage";
import { loadCliRotationPreferences } from "../../utils/cli-pools/preferences";
import { loadRestartOnSwitch } from "../../utils/common/settings/restart-on-switch";
import { loadTrackedPollIntervalPreference } from "../../utils/common/settings/poll-interval";
import { buildAgentApiSnapshot } from "../../utils/agent-api/snapshot";
import { observePoolQuota, recordQuotaEvidence, nextEligibleCandidate } from "../../utils/cli-pools/auto-failover";
import { findAntigravityAccountMatch, findCodexAccountMatch } from "../../utils/account/current-account";
import { extractAntigravitySessionAccount } from "../../utils/antigravity/current-local-session";
import { parseCodexLocalAuth } from "../../utils/codex/current-local-session";

interface AutoContext {
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  agCache: Record<string, AntigravityUsageCacheEntry>;
  cxCache: Record<string, any>;
  activeAntigravityId: string | null;
  activeCodexId: string | null;
  applyAntigravity: (account: AntigravityAccount, skipConfirm: boolean) => Promise<void>;
  applyCodex: (account: CodexAccount, skipConfirm: boolean) => Promise<void>;
}
interface Plan {
  candidateAccountId: string;
  targetPid: number;
  conversationResolution: { isAmbiguous: boolean; id: string | null };
}
const COOLDOWN_MS = 300_000;

async function verifyApplied(provider: "agy" | "codex", account: AntigravityAccount | CodexAccount) {
  if (provider === "agy") {
    const local = extractAntigravitySessionAccount(await invoke("read_antigravity_session"));
    if (!local || !findAntigravityAccountMatch([account as AntigravityAccount], local)) {
      throw new Error("Antigravity session identity was not verified");
    }
  } else {
    const local = parseCodexLocalAuth(await invoke("read_codex_auth"));
    if (!local || !findCodexAccountMatch([account as CodexAccount], local)) {
      throw new Error("Codex session identity was not verified");
    }
  }
}

/** Detects quota hits but never kills a process; the native preflight must succeed first. */
export function useCliPoolAutoFailover(
  props: AutoContext,
  busy: MutableRefObject<boolean>,
): void {
  const current = useRef(props);
  current.current = props;
  const history = useRef(new Map());
  const cooldown = useRef(new Map<string, number>());

  useEffect(() => {
    const prefs = loadCliRotationPreferences();
    // Existing Apply restarts and restores CLI sessions only when restart is enabled.
    if (!prefs.enabled || !loadRestartOnSwitch() || busy.current) return;
    const p = current.current;
    const pools = loadCliRotationPools();
    const bindings = loadCliRotationBindings(pools);
    const now = Date.now();
    const maxAge = Math.max(300_000, loadTrackedPollIntervalPreference() * 2000);
    const snapshot = buildAgentApiSnapshot(p.antigravityAccounts, p.codexAccounts,
      p.agCache, p.cxCache, p.activeAntigravityId, p.activeCodexId);

    for (const provider of ["agy", "codex"] as const) {
      const poolId = provider === "agy" ? bindings.agyActivePoolId : bindings.codexActivePoolId;
      const pool = pools.find((x) => x.id === poolId && x.provider === provider);
      const active = provider === "agy" ? p.activeAntigravityId : p.activeCodexId;
      if (!pool || !active || !pool.enabled || !pool.autoSwitch ||
        !pool.accountIds.includes(active) || pool.switchWhenIdleOnly) continue;
      const entry = provider === "agy" ? p.agCache[active] : p.cxCache[active];
      for (const window of pool.triggerWindows) {
        const reading = observePoolQuota(provider, entry, window, now, maxAge);
        const key = `${provider}:${active}:${window}`;
        const exhausted = recordQuotaEvidence(
          history.current, key, reading, now,
          prefs.requiredFreshSamples, prefs.minSampleSeparationSecs,
        );
        if (!exhausted || busy.current) continue;
        const nextId = nextEligibleCandidate(pool, active, snapshot.accounts, now, maxAge);
        if (!nextId) continue;
        const cooldownKey = `${key}:${reading?.resetAt ?? "unknown"}`;
        if ((cooldown.current.get(cooldownKey) ?? 0) > now) continue;
        cooldown.current.set(cooldownKey, now + COOLDOWN_MS);
        busy.current = true;
        void (async () => {
          try {
            const unavailable = pool.accountIds.filter((id) =>
              id !== active && id !== nextId && !snapshot.accounts.some((candidate) =>
                candidate.id === id &&
                candidate.provider === (provider === "agy" ? "antigravity" : "codex") &&
                candidate.remainingPercent !== null && candidate.remainingPercent > 0 &&
                candidate.updatedAt !== null && candidate.updatedAt <= now &&
                now - candidate.updatedAt <= maxAge,
              ));
            const plan = await invoke<Plan>("cli_pool_preflight_auto_rotation", {
              pool, currentAccountId: active, unavailableAccountIds: unavailable,
              continuationPrompt: prefs.continuationPrompt,
            });
            if (plan.candidateAccountId !== nextId || plan.conversationResolution.isAmbiguous ||
              !Number.isInteger(plan.targetPid) || plan.targetPid < 1) {
              throw new Error("CLI rotation plan changed or is ambiguous");
            }
            // Revalidate before applying: the user could have manually switched accounts.
            const latest = current.current;
            const stillActive = provider === "agy"
              ? latest.activeAntigravityId === active : latest.activeCodexId === active;
            if (!stillActive || !loadCliRotationPreferences().enabled || !loadRestartOnSwitch()) {
              throw new Error("CLI pool selection changed while planning");
            }
            const account = provider === "agy"
              ? latest.antigravityAccounts.find((x) => x.id === nextId)
              : latest.codexAccounts.find((x) => x.id === nextId);
            if (!account) throw new Error("Candidate account is no longer saved");
            if (provider === "agy") await latest.applyAntigravity(account as AntigravityAccount, true);
            else await latest.applyCodex(account as CodexAccount, true);
            await verifyApplied(provider, account);
          } catch (error) {
            console.warn("Auto CLI pool rotation safely stopped:", String(error));
          } finally {
            busy.current = false;
          }
        })();
        break;
      }
    }
  }, [
    props.agCache, props.cxCache, props.activeAntigravityId,
    props.activeCodexId, props.antigravityAccounts, props.codexAccounts,
  ]);
}
