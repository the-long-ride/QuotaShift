import type { OverlayAccountData } from "./overlay-types";

export const OVERLAY_CARD_INDEX_ATTR = "data-overlay-card-index";
export const OVERLAY_CARD_PROVIDER_ATTR = "data-overlay-card-provider";
export const OVERLAY_CARD_ACCOUNT_ID_ATTR = "data-overlay-card-account-id";

export interface ResolvedTargetAccount {
  provider: OverlayAccountData["provider"];
  accountId?: string | null;
  card?: OverlayAccountData;
}

/**
 * Accurately detects which tracked account was right-clicked or clicked in the overlay.
 * Uses both DOM element traversal and cursor coordinate geometry to handle stacked cards,
 * padding, gaps, and borders when multiple accounts are tracked.
 */
export function resolveTargetAccountFromClick(
  target: EventTarget | null,
  clientY: number | undefined,
  cards: OverlayAccountData[],
): ResolvedTargetAccount {
  if (!cards.length) {
    return { provider: "antigravity", accountId: null };
  }

  // 1. Direct hit on or inside a card slot element.
  const targetEl = target as HTMLElement | null;
  const directSlot = targetEl?.closest?.(`[${OVERLAY_CARD_INDEX_ATTR}]`);
  if (directSlot) {
    const rawIndex = directSlot.getAttribute(OVERLAY_CARD_INDEX_ATTR);
    const index = rawIndex ? Number.parseInt(rawIndex, 10) : 0;
    if (Number.isInteger(index) && index >= 0 && index < cards.length) {
      return {
        provider: cards[index].provider,
        accountId: cards[index].accountId ?? directSlot.getAttribute(OVERLAY_CARD_ACCOUNT_ID_ATTR),
        card: cards[index],
      };
    }
  }

  // 2. Coordinate geometry detection: find which card slot bounds contain or are nearest to clientY.
  if (typeof clientY === "number" && typeof document !== "undefined") {
    const slots = Array.from(
      document.querySelectorAll<HTMLElement>(`[${OVERLAY_CARD_INDEX_ATTR}]`),
    );
    if (slots.length > 0) {
      let nearestSlot: HTMLElement | null = null;
      let minDistance = Number.POSITIVE_INFINITY;

      for (const slot of slots) {
        const rect = slot.getBoundingClientRect();
        if (clientY >= rect.top && clientY <= rect.bottom) {
          nearestSlot = slot;
          break;
        }
        const center = rect.top + rect.height / 2;
        const dist = Math.abs(clientY - center);
        if (dist < minDistance) {
          minDistance = dist;
          nearestSlot = slot;
        }
      }

      if (nearestSlot) {
        const rawIndex = nearestSlot.getAttribute(OVERLAY_CARD_INDEX_ATTR);
        const index = rawIndex ? Number.parseInt(rawIndex, 10) : 0;
        if (Number.isInteger(index) && index >= 0 && index < cards.length) {
          return {
            provider: cards[index].provider,
            accountId:
              cards[index].accountId ?? nearestSlot.getAttribute(OVERLAY_CARD_ACCOUNT_ID_ATTR),
            card: cards[index],
          };
        }
      }
    }
  }

  // 3. Fallback to primary account.
  const primary = cards[0];
  return {
    provider: primary.provider,
    accountId: primary.accountId ?? null,
    card: primary,
  };
}
