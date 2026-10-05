import type { OverlayAccountData } from "./overlay-types";
import { MAX_TRACKED } from "./tracked-accounts.js";

/** Adds the non-primary tracked accounts to the overlay payload (max 3 cards in total). */
export function attachAdditionalAccounts(
  primary: OverlayAccountData,
  ids: string[],
  build: (accountId: string) => OverlayAccountData | null,
): OverlayAccountData {
  const { additionalAccounts: _previous, ...base } = primary;
  const seen = new Set<string>(primary.accountId ? [primary.accountId] : []);
  const extras: OverlayAccountData[] = [];
  for (const id of ids) {
    if (extras.length >= MAX_TRACKED - 1) break;
    if (seen.has(id)) continue;
    const data = build(id);
    if (!data || data.accountId !== id) continue;
    const { additionalAccounts: _nested, ...card } = data;
    extras.push(card);
    seen.add(id);
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
