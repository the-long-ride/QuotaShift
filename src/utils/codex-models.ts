import type {
  CodexAccount,
  CodexAvailableModel,
  CodexModelCatalogCacheEntry,
  CodexModelSelectionMode,
  CodexPoolModelValidation,
  CodexTierModelGroup,
} from "./types.js";

export const CODEX_MODEL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

function readCatalogRows(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.models)) return value.models;
  if (Array.isArray(value.data)) return value.data;
  return [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function normalizeCodexModelCatalog(raw: unknown): CodexAvailableModel[] {
  const seen = new Set<string>();
  const normalized: CodexAvailableModel[] = [];

  for (const row of readCatalogRows(raw)) {
    if (!row || typeof row !== "object") continue;
    const candidate = row as Record<string, unknown>;
    const id =
      stringValue(candidate.slug) ?? stringValue(candidate.id) ?? stringValue(candidate.model);
    if (!id || seen.has(id)) continue;

    const displayName =
      stringValue(candidate.display_name) ?? stringValue(candidate.displayName) ?? id;
    const visibility = stringValue(candidate.visibility);
    const supportedInApi =
      typeof candidate.supported_in_api === "boolean"
        ? candidate.supported_in_api
        : typeof candidate.supportedInApi === "boolean"
          ? candidate.supportedInApi
          : null;

    seen.add(id);
    normalized.push({ id, displayName, visibility, supportedInApi });
  }

  return normalized;
}

export function isCodexModelCacheFresh(
  entry: CodexModelCatalogCacheEntry | undefined,
  now = Date.now(),
): boolean {
  return Boolean(
    entry &&
    !entry.error &&
    Number.isFinite(entry.fetchedAt) &&
    now - entry.fetchedAt < CODEX_MODEL_CACHE_TTL_MS,
  );
}

function displayTier(planName: string | null | undefined): string {
  const trimmed = planName?.trim();
  if (!trimmed) return "Unknown";
  return trimmed.replace(/^ChatGPT\s+/i, "") || "Unknown";
}

export function buildCodexTierModelGroups(
  accounts: CodexAccount[],
  cache: Record<string, CodexModelCatalogCacheEntry>,
  now = Date.now(),
): CodexTierModelGroup[] {
  const grouped = new Map<string, CodexAccount[]>();
  for (const account of accounts) {
    const tier = displayTier(account.lastPlan ?? cache[account.id]?.planName);
    const list = grouped.get(tier) ?? [];
    list.push(account);
    grouped.set(tier, list);
  }

  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([tier, tierAccounts]) => {
      const support = new Map<string, { model: CodexAvailableModel; count: number }>();
      let scannedCount = 0;

      for (const account of tierAccounts) {
        const entry = cache[account.id];
        if (!isCodexModelCacheFresh(entry, now)) continue;
        scannedCount += 1;
        for (const model of entry.models) {
          const existing = support.get(model.id);
          if (existing) existing.count += 1;
          else support.set(model.id, { model, count: 1 });
        }
      }

      const models = [...support.values()]
        .sort((a, b) => a.model.id.localeCompare(b.model.id))
        .map(({ model, count }) => ({
          model,
          supportCount: count,
          supportedByAll: scannedCount > 0 && count === scannedCount,
        }));

      return {
        tier,
        accountCount: tierAccounts.length,
        scannedCount,
        failedCount: tierAccounts.length - scannedCount,
        models,
      };
    });
}

function compatibilityReason(
  model: string,
  accountExists: boolean,
  entry: CodexModelCatalogCacheEntry | undefined,
  now: number,
): string | null {
  if (!accountExists) return "Saved account is unavailable.";
  if (!entry) return "Model catalog is unavailable or unverified for this account.";
  if (entry.error) return `Model scan failed: ${entry.error}`;
  if (!isCodexModelCacheFresh(entry, now)) return "Model scan is stale; rescan this account.";
  if (!entry.models.some((candidate) => candidate.id === model)) {
    return `Model ${model} is not available for this account.`;
  }
  return null;
}

export function validateCodexPoolModel(
  model: string,
  mode: CodexModelSelectionMode,
  accountIds: string[],
  accounts: CodexAccount[],
  cache: Record<string, CodexModelCatalogCacheEntry>,
  now = Date.now(),
): CodexPoolModelValidation {
  const trimmedModel = model.trim();
  const accountsById = new Map(accounts.map((account) => [account.id, account]));
  const incompatibleAccountIds: string[] = [];
  const reasons: Record<string, string> = {};

  for (const accountId of accountIds) {
    const reason = compatibilityReason(
      trimmedModel,
      accountsById.has(accountId),
      cache[accountId],
      now,
    );
    if (!reason) continue;
    incompatibleAccountIds.push(accountId);
    reasons[accountId] = reason;
  }

  const strict = mode === "discovered";
  return {
    canSave: strict ? incompatibleAccountIds.length === 0 : true,
    warning: !strict && incompatibleAccountIds.length > 0,
    incompatibleAccountIds,
    reasons,
  };
}
