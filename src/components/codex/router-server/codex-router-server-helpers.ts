import { invoke } from "@tauri-apps/api/core";
import type { CodexRouterStatus } from "../../../utils/common/types";

export const DEFAULT_ROUTER_STATUS: CodexRouterStatus = {
  running: false,
  baseUrl: null,
  port: null,
  uptimeSecs: 0,
  routedRequestCount: 0,
  inFlightRequests: 0,
  totalInputTokens: 0,
  totalOutputTokens: 0,
  totalReasoningTokens: 0,
  totalCachedTokens: 0,
  cacheHitRequests: 0,
  lastRoutedModel: null,
  lastRoutedAccountId: null,
  clientCoverage: {},
};

/** Empty input means an OS-assigned port. */
export function parsePortInput(raw: string): number | null | "invalid" {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+$/.test(value)) return "invalid";
  const port = Number(value);
  return port >= 1024 && port <= 65535 ? port : "invalid";
}

export function formatUptime(seconds?: number | null): string {
  if (seconds == null) return "-";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

export function formatCompactTokens(tokens?: number | null): string {
  const n = Math.max(0, Math.floor(tokens ?? 0));
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

export function formatCacheHitPercentage(
  cachedTokens?: number | null,
  inputTokens?: number | null,
): string {
  const cached = Math.max(0, cachedTokens ?? 0);
  const input = Math.max(0, inputTokens ?? 0);
  if (input === 0) return "0%";
  const pct = Math.min(100, Math.round((cached / input) * 100));
  return `${pct}%`;
}

export async function rotateRouterKey(
  currentPort: number | null,
  updateClaudeProfiles: boolean,
): Promise<{
  status: CodexRouterStatus;
  message: string;
}> {
  const status = await invoke<CodexRouterStatus>("restart_codex_router", {
    port: currentPort,
    rotateKey: true,
    pin: null,
  });
  let updatedProfileNames: string[] = [];
  if (updateClaudeProfiles) {
    try {
      const newKey = await invoke<string>("get_codex_router_key");
      updatedProfileNames = await invoke<string[]>("update_claude_profiles_routing_key", {
        newKey,
      });
    } catch (error) {
      console.error("Failed to update Claude profiles with new key:", error);
    }
  }
  let message = "QuotaShift model routing key has been re-generated.";
  if (updateClaudeProfiles && updatedProfileNames.length > 0) {
    message = `QuotaShift model routing key has been updated for these claude profiles: ${updatedProfileNames.join(", ")}`;
  }
  return { status, message };
}
