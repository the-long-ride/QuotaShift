import type {
  CodexModelPoolV2,
  KnownAccountLike,
  MigrationResultV2,
  PoolAuthMode,
} from "./codex-pools-v2-types.js";

export function deduplicateStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed && !seen.has(trimmed)) {
      seen.add(trimmed);
      result.push(trimmed);
    }
  }
  return result;
}

export function inferAuthMode(
  accountIds: string[],
  knownAccounts?: KnownAccountLike[],
): { mode: PoolAuthMode; ambiguous: boolean } {
  if (!knownAccounts || accountIds.length === 0) {
    return { mode: "siwc", ambiguous: false };
  }
  const knownMap = new Map(knownAccounts.map((a) => [a.id, a]));
  const modes = new Set<string>();

  for (const id of accountIds) {
    const acc = knownMap.get(id);
    if (!acc) continue;
    if (acc.authMode === "openai-api-key" || acc.authMode === "apiKey") {
      modes.add("openai-api-key");
    } else {
      modes.add("siwc");
    }
  }

  if (modes.size > 1) {
    return { mode: "siwc", ambiguous: true };
  }
  if (modes.has("openai-api-key")) {
    return { mode: "openai-api-key", ambiguous: false };
  }
  return { mode: "siwc", ambiguous: false };
}

export function migrateCodexPoolsV1(
  rawV1Pools: unknown,
  activePoolId: string | null | undefined,
  knownAccounts?: KnownAccountLike[],
): MigrationResultV2 {
  const diagnostics: string[] = [];
  if (!Array.isArray(rawV1Pools)) {
    return { pools: [], diagnostics };
  }

  const migrated: CodexModelPoolV2[] = [];
  const seenIds = new Set<string>();

  for (const raw of rawV1Pools) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const model = typeof raw.model === "string" ? raw.model.trim() : "";
    if (!id || !name || !model || seenIds.has(id)) continue;
    seenIds.add(id);

    const accountIds = Array.isArray(raw.accountIds)
      ? deduplicateStrings(
          raw.accountIds.filter((item: unknown): item is string => typeof item === "string"),
        )
      : [];

    const { mode, ambiguous } = inferAuthMode(accountIds, knownAccounts);
    if (ambiguous) {
      diagnostics.push(`Pool '${name}' (${id}) has ambiguous mixed auth modes; migrated disabled.`);
    }

    const isTargetActive = Boolean(activePoolId && id === activePoolId.trim());
    // Legacy Codex OAuth cannot act as a SIWC registration; preserve members
    // for the user to review, but require explicit native SIWC reauthorization.
    const needsSiwcAuthorization = mode === "siwc";
    if (needsSiwcAuthorization) {
      diagnostics.push(
        `Pool '${name}' (${id}) needs separate SIWC authorization before routing; legacy Codex OAuth is not eligible.`,
      );
    }
    const canEnable =
      isTargetActive && !ambiguous && !needsSiwcAuthorization && accountIds.length > 0;

    migrated.push({
      id,
      displayName: name,
      publicModelName: model,
      upstreamModelId: model,
      enabled: canEnable,
      memberAccountIds: accountIds,
      modelSelectionMode: raw.modelSelectionMode === "discovered" ? "discovered" : "manual",
      routingPolicy: "cache-aware",
      authMode: mode,
    });
  }

  return { pools: migrated, diagnostics };
}
