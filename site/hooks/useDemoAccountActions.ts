import { useCallback, type Dispatch, type SetStateAction } from "react";
import type {
  AntigravityAccount,
  ClaudeAccount,
  ClaudeAccountUsageStatus,
  CodexAccount,
  CodexModelPoolV2,
} from "../../src/utils/common/types";
import type { CodexModelScanProgress } from "../../src/components/common/header/header-types";
import type { ToastKind } from "../../src/components/common/Toast";
import type { PlatformId } from "../../src/utils/common/ui/platform-visibility";
import {
  createInitialAntigravityState,
  nudgeAntigravityCacheEntry,
  pickBestAntigravityAccount,
  renameById,
} from "../data/demo-antigravity";
import {
  createInitialCodexState,
  nudgeCodexCacheEntry,
  pickBestCodexAccount,
} from "../data/demo-codex";
import {
  createInitialClaudeState,
  makeScanProgress,
  markClaudeRefreshed,
  renameClaudeStatus,
  resumeClaudeByConfigDir,
  toggleSetItem,
  updateRecordEntry,
} from "../data/demo-claude";
import {
  removeDemoTrackedId,
  reorderByIds,
  type DemoTrackedIds,
  type DemoUiState,
} from "./demo-coordinator-types";

type AgState = ReturnType<typeof createInitialAntigravityState>;
type CodexState = ReturnType<typeof createInitialCodexState>;
type ClaudeState = ReturnType<typeof createInitialClaudeState>;

interface UseDemoAccountActionsParams {
  agState: AgState;
  setAgState: Dispatch<SetStateAction<AgState>>;
  setActiveAntigravityId: Dispatch<SetStateAction<string | null>>;
  codexState: CodexState;
  setCodexState: Dispatch<SetStateAction<CodexState>>;
  setActiveCodexId: Dispatch<SetStateAction<string | null>>;
  setCodexModelScanProgress: Dispatch<SetStateAction<CodexModelScanProgress>>;
  setClaudeState: Dispatch<SetStateAction<ClaudeState>>;
  setRefreshingClaudeIds: Dispatch<SetStateAction<Set<string>>>;
  setTrackedIds: Dispatch<SetStateAction<DemoTrackedIds>>;
  poolRoutingEnabled: boolean;
  patchUi: (patch: Partial<DemoUiState>) => void;
  toggleTrack: (provider: PlatformId, id: string, label: string) => void;
  showToast: (message: string, kind?: ToastKind) => void;
}

export function useDemoAccountActions({
  agState,
  setAgState,
  setActiveAntigravityId,
  codexState,
  setCodexState,
  setActiveCodexId,
  setCodexModelScanProgress,
  setClaudeState,
  setRefreshingClaudeIds,
  setTrackedIds,
  poolRoutingEnabled,
  patchUi,
  toggleTrack,
  showToast,
}: UseDemoAccountActionsParams) {
  const setClaudeStatuses = useCallback(
    (fn: (s: ClaudeAccountUsageStatus[]) => ClaudeAccountUsageStatus[]) =>
      setClaudeState((p) => ({ ...p, accountStatuses: fn(p.accountStatuses) })),
    [setClaudeState],
  );

  return {
    onApplyAntigravity: async (acc: AntigravityAccount) => {
      setActiveAntigravityId(acc.id);
      setAgState((p) => ({
        ...p,
        localSession: {
          ...p.localSession,
          email: acc.email ?? null,
          planTier: acc.lastPlan ?? null,
        },
      }));
      showToast(`Applied ${acc.label} to active session`, "success");
    },
    onDeleteAntigravity: async (acc: AntigravityAccount) => {
      setAgState((p) => ({ ...p, accounts: p.accounts.filter((a) => a.id !== acc.id) }));
      setTrackedIds((p) => removeDemoTrackedId(p, "antigravity", acc.id));
      showToast(`Removed ${acc.label} (click Reset Demo to restore)`, "info");
    },
    onRenameAntigravity: (acc: AntigravityAccount, label: string) =>
      setAgState((p) => ({ ...p, accounts: renameById(p.accounts, acc.id, label) })),
    onTrackAntigravity: (acc: AntigravityAccount) => toggleTrack("antigravity", acc.id, acc.label),
    onRefreshAntigravityQuota: (acc: AntigravityAccount) => {
      setAgState((p) => ({
        ...p,
        usageCache: updateRecordEntry(p.usageCache, acc.id, nudgeAntigravityCacheEntry),
      }));
      showToast(`Refreshed ${acc.label}`, "success");
    },
    onSwitchBestAntigravity: () => {
      const best = pickBestAntigravityAccount(agState.accounts, agState.usageCache);
      if (!best) return;
      setActiveAntigravityId(best.id);
      showToast(`Switched to best Antigravity account: ${best.label}`, "success");
    },
    onReorderAntigravity: (ids: string[]) =>
      setAgState((p) => ({ ...p, accounts: reorderByIds(p.accounts, ids, (a) => a.id) })),
    onChangeModelPoolsV2: (modelPoolsV2: CodexModelPoolV2[]) => {
      setCodexState((p) => ({ ...p, modelPoolsV2 }));
      return true;
    },
    onTogglePoolRouting: () => {
      const next = !poolRoutingEnabled;
      patchUi({ poolRoutingEnabled: next });
      setCodexState((c) => ({ ...c, routerStatus: { ...c.routerStatus, running: next } }));
      showToast(next ? "Pool routing enabled" : "Pool routing paused", "info");
    },
    onRescanAllCodexModels: () => {
      const total = codexState.accounts.length;
      setCodexModelScanProgress(makeScanProgress(total, true));
      window.setTimeout(() => {
        setCodexModelScanProgress(makeScanProgress(total, false));
        showToast(`Scanned models for ${total} Codex accounts`, "success");
      }, 450);
    },
    onRescanCodexAccountModels: (acc: CodexAccount) =>
      showToast(`Rescanned models for ${acc.label}`, "success"),
    onApplyCodex: (acc: CodexAccount) => {
      setActiveCodexId(acc.id);
      showToast(`Applied ${acc.label} as active Codex account`, "success");
    },
    onDeleteCodex: (acc: CodexAccount) => {
      setCodexState((p) => ({ ...p, accounts: p.accounts.filter((a) => a.id !== acc.id) }));
      setTrackedIds((p) => removeDemoTrackedId(p, "codex", acc.id));
      showToast(`Removed ${acc.label} (click Reset Demo to restore)`, "info");
    },
    onRenameCodex: (acc: CodexAccount, label: string) =>
      setCodexState((p) => ({ ...p, accounts: renameById(p.accounts, acc.id, label) })),
    onTrackCodex: (acc: CodexAccount) => toggleTrack("codex", acc.id, acc.label),
    onRefreshCodex: (acc: CodexAccount) => {
      setCodexState((p) => ({
        ...p,
        usageCache: updateRecordEntry(p.usageCache, acc.id, nudgeCodexCacheEntry),
      }));
      showToast(`Refreshed ${acc.label}`, "success");
    },
    onSwitchBestCodex: () => {
      const best = pickBestCodexAccount(codexState.accounts, codexState.usageCache);
      if (!best) return;
      setActiveCodexId(best.id);
      showToast(`Switched to best Codex account: ${best.label}`, "success");
    },
    onReorderCodex: (ids: string[]) =>
      setCodexState((p) => ({ ...p, accounts: reorderByIds(p.accounts, ids, (a) => a.id) })),
    onTrackClaude: (s: ClaudeAccountUsageStatus) =>
      toggleTrack("claude", s.account.id, s.account.profileName),
    onRefreshClaudeAccount: (id: string) => {
      setRefreshingClaudeIds((p) => toggleSetItem(p, id, true));
      window.setTimeout(() => {
        setClaudeStatuses((s) => markClaudeRefreshed(s, id));
        setRefreshingClaudeIds((p) => toggleSetItem(p, id, false));
        showToast("Refreshed Claude account usage", "success");
      }, 300);
    },
    onResumeClaudeAccount: (dir: string) => {
      setClaudeStatuses((s) => resumeClaudeByConfigDir(s, dir));
      showToast(`Resumed Claude Code processes for ${dir}`, "success");
    },
    onReorderClaude: (ids: string[]) =>
      setClaudeStatuses((s) => reorderByIds(s, ids, (x) => x.account.id)),
    onRenameClaude: (acc: ClaudeAccount, alias: string) =>
      setClaudeStatuses((s) => renameClaudeStatus(s, acc.id, alias)),
    onRescanClaudeProfiles: () => showToast("Rescanned 3 Claude Code profiles", "success"),
  };
}
