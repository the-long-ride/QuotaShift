import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AntigravityAccount, AntigravityUsageCacheEntry, CodexAccount } from "../../utils/common/types";
import { buildAgentApiSnapshot } from "../../utils/agent-api/snapshot";
import { loadCliRotationBindings, loadCliRotationPools } from "../../utils/common/backup/app-storage";
import { loadCliRotationPreferences } from "../../utils/cli-pools/preferences";
import { loadTrackedList } from "../../utils/common/accounts/tracked-accounts";
import {
  loadTrackedPollIntervalPreference, TRACKED_POLL_INTERVAL_CHANGED_EVENT,
} from "../../utils/common/settings/poll-interval";
import { useCliPoolAutoFailover } from "./useCliPoolAutoFailover";
import { findCodexAccountMatch, findAntigravityAccountMatch } from "../../utils/account/current-account";
import { extractAntigravitySessionAccount } from "../../utils/antigravity/current-local-session";
import { parseCodexLocalAuth } from "../../utils/codex/current-local-session";

type Apply = (account: any, skipConfirm: boolean) => Promise<void>;
type RotationEvent = { operationId: string; provider: string; accountId: string };
interface Props {
  antigravityAccounts: AntigravityAccount[];
  codexAccounts: CodexAccount[];
  agCache: Record<string, AntigravityUsageCacheEntry>;
  cxCache: Record<string, any>;
  activeAntigravityId: string | null;
  activeCodexId: string | null;
  applyAntigravity: Apply;
  applyCodex: Apply;
  refreshAntigravity: (accounts: AntigravityAccount[], force?: boolean, maxAgeMs?: number) => Promise<void>;
  refreshCodex: (account: CodexAccount, force?: boolean) => Promise<any>;
}
const AUTO_ENABLED_KEY = "quotashift_agent_api_enabled_v1";
const AUTO_PORT_KEY = "quotashift_agent_api_port_v1";
const AUTO_WRITE_KEY = "quotashift_agent_api_write_v1";

export function useAgentApiBridge(props: Props): void {
  const current = useRef(props);
  current.current = props;
  // One shared switch slot across unattended rotation and authenticated API calls.
  const switchBusy = useRef(false);
  useCliPoolAutoFailover(props, switchBusy);
  useEffect(() => {
    const port = Number(localStorage.getItem(AUTO_PORT_KEY) || 45692);
    if (localStorage.getItem(AUTO_ENABLED_KEY) === "true") {
      void invoke("agent_api_start", {
        port, writeEnabled: localStorage.getItem(AUTO_WRITE_KEY) === "true",
      }).catch((error) => console.warn("Agent API startup unavailable:", String(error)));
    }
  }, []);
  useEffect(() => {
    const p = current.current;
    const snapshot = buildAgentApiSnapshot(
      p.antigravityAccounts, p.codexAccounts, p.agCache, p.cxCache,
      p.activeAntigravityId, p.activeCodexId,
    );
    void invoke("agent_api_publish_snapshot", { snapshot })
      .catch((error) => console.warn("Agent API snapshot unavailable:", String(error)));
  }, [
    props.antigravityAccounts, props.codexAccounts, props.agCache, props.cxCache,
    props.activeAntigravityId, props.activeCodexId,
  ]);
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void listen<RotationEvent>("quotashift:agent-rotation", async ({ payload }) => {
      if (switchBusy.current) {
        await invoke("agent_api_finish_rotation", {
          operationId: payload.operationId, success: false,
        }).catch(console.warn);
        return;
      }
      switchBusy.current = true;
      let success = false;
      try {
        const state = current.current;
        if (payload.provider === "antigravity") {
          const account = state.antigravityAccounts.find((a) => a.id === payload.accountId);
          if (!account) throw new Error("Antigravity account not found");
          const nativeAg = extractAntigravitySessionAccount(await invoke("read_antigravity_session"));
          const agMatches = Boolean(nativeAg && findAntigravityAccountMatch([account], nativeAg));
          if (state.activeAntigravityId !== account.id || !agMatches) {
            await state.applyAntigravity(account, true);
          }
          const verified = extractAntigravitySessionAccount(await invoke("read_antigravity_session"));
          if (!verified || !findAntigravityAccountMatch([account], verified)) {
            throw new Error("Antigravity local identity did not match the requested account");
          }
        } else if (payload.provider === "codex") {
          const account = state.codexAccounts.find((a) => a.id === payload.accountId);
          if (!account) throw new Error("Codex account not found");
          const nativeCodex = parseCodexLocalAuth(await invoke("read_codex_auth"));
          const codexMatches = Boolean(nativeCodex && findCodexAccountMatch([account], nativeCodex));
          if (state.activeCodexId !== account.id || !codexMatches) {
            await state.applyCodex(account, true);
          }
          const verified = parseCodexLocalAuth(await invoke("read_codex_auth"));
          if (!verified || !findCodexAccountMatch([account], verified)) {
            throw new Error("Codex local account identity did not match the requested ID");
          }
        } else throw new Error("Unsupported provider");
        success = true;
      } catch (error) {
        console.warn("Agent API rotation failed:", String(error));
      } finally {
        await invoke("agent_api_finish_rotation", {
          operationId: payload.operationId, success,
        }).catch(console.warn);
        switchBusy.current = false;
      }
    }).then((stop) => {
      if (disposed) stop(); else unlisten = stop;
    });
    return () => { disposed = true; unlisten?.(); };
  }, []);

  // Active CLI pool accounts receive the tracked-account polling cadence even
  // when they are not monitored. Never double-fetch an already tracked entry.
  useEffect(() => {
    const refresh = () => {
      if (!loadCliRotationPreferences().enabled) return;
      const p = current.current;
      const pools = loadCliRotationPools();
      const bindings = loadCliRotationBindings(pools);
      const tracked = loadTrackedList();
      for (const provider of ["agy", "codex"] as const) {
        const poolId = provider === "agy" ? bindings.agyActivePoolId : bindings.codexActivePoolId;
        const pool = pools.find((x) => x.id === poolId && x.enabled && x.autoSwitch);
        const id = provider === "agy" ? p.activeAntigravityId : p.activeCodexId;
        if (!pool || !id || !pool.accountIds.includes(id)) continue;
        const name = provider === "agy" ? "antigravity" : "codex";
        if (tracked.some((e) => e.provider === name && e.id === id)) continue;
        if (provider === "agy") {
          const account = p.antigravityAccounts.find((a) => a.id === id);
          if (account) void p.refreshAntigravity([account], false, 0).catch(console.warn);
        } else {
          const account = p.codexAccounts.find((a) => a.id === id);
          if (account) void p.refreshCodex(account, true).catch(console.warn);
        }
      }
    };
    let interval: number;
    const reschedule = () => {
      window.clearInterval(interval);
      interval = window.setInterval(refresh, loadTrackedPollIntervalPreference() * 1000);
    };
    reschedule();
    window.addEventListener(TRACKED_POLL_INTERVAL_CHANGED_EVENT, reschedule);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener(TRACKED_POLL_INTERVAL_CHANGED_EVENT, reschedule);
    };
  }, []);
}
