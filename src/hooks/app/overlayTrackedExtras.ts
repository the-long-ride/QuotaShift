import type { OverlayAccountData } from "../../components/overlay/OverlayApp";
import type {
  AntigravityUsageCacheEntry,
  ClaudeAccountUsageStatus,
  UseAppUsageAndOverlayParams,
} from "./useAppUsageAndOverlay.types";
import { buildTrackedClaudeOverlayPayload } from "../../utils/common/app-overlay-helpers";
import { buildActiveOverlayData } from "../../utils/common/overlay-builder";
import { attachAdditionalAccounts } from "../../utils/common/overlay-extra-accounts";
import {
  loadClaudeResetCreditsEnabled,
  type ClaudeResetCredits,
} from "../../utils/claude/claude-reset-credits";
import {
  OVERLAY_TRACKED_ACCOUNT_ID_KEY,
  OVERLAY_TRACKED_PROVIDER_KEY,
} from "../../utils/common/app-constants";
import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { DISPLAY_MODE_EVENT, saveDisplayMode } from "../../utils/common/display-mode";
import type { TrackedEntry, TrackedProvider } from "../../utils/common/tracked-accounts";
import type { useClaudeResetCredits } from "../claude/useClaudeResetCredits";
import type { useCodexUsageFetcher } from "../codex/useCodexUsageFetcher";

export interface TrackedExtrasContext {
  params: UseAppUsageAndOverlayParams;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexUsageCache: ReturnType<typeof useCodexUsageFetcher>["codexUsageCache"];
  resetCreditsByAccountId: ReturnType<typeof useClaudeResetCredits>["resetCreditsByAccountId"];
}

/** Builds a card for each other tracked account, from any provider (max 3 cards total). */
export function attachTrackedExtras(
  payload: OverlayAccountData,
  entries: TrackedEntry[],
  ctx: TrackedExtrasContext,
): OverlayAccountData {
  const { params, antigravityUsageCache, codexUsageCache, resetCreditsByAccountId } = ctx;
  // Cards always get reset counts; the overlay/taskbar badge stays behind the opt-in setting.
  const showResets = loadClaudeResetCreditsEnabled();
  return attachAdditionalAccounts(payload, entries, ({ provider, id }) =>
    provider === "claude"
      ? buildTrackedClaudeOverlayPayload({
          trackedAccountId: id,
          accountStatuses: params.claudeAccountStatuses,
          monitorStatus: params.claudeMonitorStatus,
          prev: null,
          resetCredits: showResets ? (resetCreditsByAccountId[id] ?? null) : null,
        })
      : buildActiveOverlayData({
          ...params,
          savedTrackedProvider: provider,
          savedTrackedAccountId: id,
          isCodexTracked: provider === "codex",
          antigravityUsageCache,
          codexUsageCache,
          localAntigravitySession: params.localAntigravitySession,
          prevOverlayData: null,
        }).payload,
  );
}

export function resolveFallbackClaudeAccountId(
  statuses: ClaudeAccountUsageStatus[],
): string | null {
  if (!statuses.length) return null;
  const match = statuses.find(
    (status) => status.account.profileName.trim().toLowerCase() === "default",
  );
  return (match ?? statuses[0]).account.id;
}

export interface ResolvePrimaryPayloadOptions {
  isClaudeTracked: boolean;
  isCodexTracked: boolean;
  savedTrackedProvider: string | null;
  savedTrackedAccountId: string | null;
  claudeAccountStatuses: ClaudeAccountUsageStatus[];
  claudeMonitorStatus: any;
  prevOverlayData: OverlayAccountData | null;
  resetCredits: ClaudeResetCredits | null;
  params: UseAppUsageAndOverlayParams;
  antigravityUsageCache: Record<string, AntigravityUsageCacheEntry>;
  codexUsageCache: Record<string, any>;
  localAntigravitySession: any;
  syncTrackedIdentityState: (provider: TrackedProvider, accountId: string | null) => void;
}

export function resolvePrimaryPayload(options: ResolvePrimaryPayloadOptions): OverlayAccountData {
  const {
    isClaudeTracked,
    isCodexTracked,
    savedTrackedProvider,
    savedTrackedAccountId,
    claudeAccountStatuses,
    claudeMonitorStatus,
    prevOverlayData,
    resetCredits,
    params,
    antigravityUsageCache,
    codexUsageCache,
    localAntigravitySession,
    syncTrackedIdentityState,
  } = options;

  if (isClaudeTracked) {
    return buildTrackedClaudeOverlayPayload({
      trackedAccountId: savedTrackedAccountId,
      accountStatuses: claudeAccountStatuses,
      monitorStatus: claudeMonitorStatus,
      prev: prevOverlayData,
      resetCredits,
    });
  }

  const built = buildActiveOverlayData({
    ...params,
    savedTrackedProvider,
    savedTrackedAccountId,
    isCodexTracked,
    antigravityUsageCache,
    codexUsageCache,
    localAntigravitySession,
    prevOverlayData,
  });

  if (built.syncIdentity) {
    syncTrackedIdentityState(built.syncIdentity.provider, built.syncIdentity.accountId);
    localStorage.setItem(OVERLAY_TRACKED_PROVIDER_KEY, built.syncIdentity.provider);
    localStorage.setItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY, built.syncIdentity.accountId);
  }

  return built.payload;
}

export function clearMonitoredOverlayState(): void {
  try {
    localStorage.removeItem(OVERLAY_TRACKED_PROVIDER_KEY);
    localStorage.removeItem(OVERLAY_TRACKED_ACCOUNT_ID_KEY);
    localStorage.removeItem("quotashift_overlay_data");
    saveDisplayMode("none");
    void invoke("set_monitored_codex", { info: null }).catch(console.warn);
    void invoke("set_monitored_tray", { info: null }).catch(console.warn);
    void invoke("set_display_mode", { mode: "none" }).catch(console.warn);
    void emit(DISPLAY_MODE_EVENT, "none").catch(console.warn);
    void emit("overlay-data-update", null).catch(console.warn);
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(DISPLAY_MODE_EVENT, { detail: "none" }));
    }
  } catch {}
}
