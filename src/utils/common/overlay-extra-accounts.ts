import type { OverlayAccountData } from "./overlay-types";
import { MAX_TRACKED, type TrackedEntry } from "./tracked-accounts.js";

const cardKey = (provider: string, accountId: string) => `${provider}:${accountId}`;

/** Adds the non-primary tracked accounts, any provider, to the payload (max 3 cards in total). */
export function attachAdditionalAccounts(
  primary: OverlayAccountData,
  entries: TrackedEntry[],
  build: (entry: TrackedEntry) => OverlayAccountData | null,
): OverlayAccountData {
  const { additionalAccounts: _previous, ...base } = primary;
  const seen = new Set<string>(
    primary.accountId ? [cardKey(primary.provider, primary.accountId)] : [],
  );
  const extras: OverlayAccountData[] = [];
  for (const entry of entries) {
    if (extras.length >= MAX_TRACKED - 1) break;
    const key = cardKey(entry.provider, entry.id);
    if (seen.has(key)) continue;
    const data = build(entry);
    if (!data || data.provider !== entry.provider || data.accountId !== entry.id) continue;
    const { additionalAccounts: _nested, ...card } = data;
    extras.push(card);
    seen.add(key);
  }
  return extras.length ? { ...base, additionalAccounts: extras } : base;
}

export function listOverlayAccounts(
  payload: OverlayAccountData | null | undefined,
): OverlayAccountData[] {
  if (!payload) return [];
  const { additionalAccounts, ...primary } = payload;
  return [primary, ...(additionalAccounts ?? [])];
}
