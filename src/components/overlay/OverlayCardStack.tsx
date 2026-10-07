import React, { useEffect, useMemo, useRef, useState } from "react";
import { OverlayCard } from "./OverlayCard";
import { OverlayNavArrow } from "./OverlayNavArrow";
import type { OverlayAccountData } from "./OverlayApp";

export const OVERLAY_CARD_INDEX_ATTR = "data-overlay-card-index";
export const OVERLAY_CARD_PROVIDER_ATTR = "data-overlay-card-provider";
export const OVERLAY_CARD_ACCOUNT_ID_ATTR = "data-overlay-card-account-id";

export const MAX_VIEWPORT_CARDS = 3;

/** Index of the stacked card under the pointer; 0 (primary) when outside any card. */
export function resolveHoveredCardIndex(target: HTMLElement | null, count: number): number {
  const raw = target
    ?.closest?.(`[${OVERLAY_CARD_INDEX_ATTR}]`)
    ?.getAttribute(OVERLAY_CARD_INDEX_ATTR);
  const index = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

/** Dashboard tab (provider) of the stacked card under `target`; null outside any card. */
export function dashboardTabForTarget(target: EventTarget | null): string | null {
  const slot = (target as HTMLElement | null)?.closest?.(`[${OVERLAY_CARD_PROVIDER_ATTR}]`);
  return slot?.getAttribute(OVERLAY_CARD_PROVIDER_ATTR) ?? null;
}

interface OverlayCardStackProps {
  cards: OverlayAccountData[];
  avatarError: boolean;
  setAvatarError: (value: boolean) => void;
  showTooltip: boolean;
  tooltipText: string | null;
  activeIndex: number;
}

/** Renders tracked accounts stacked vertically, limiting viewport to 3 cards with arrows and wheel pagination. */
export const OverlayCardStack: React.FC<OverlayCardStackProps> = ({
  cards,
  avatarError,
  setAvatarError,
  showTooltip,
  tooltipText,
  activeIndex,
}) => {
  const [extraAvatarErrors, setExtraAvatarErrors] = useState<Record<string, boolean>>({});
  const stackRef = useRef<HTMLDivElement>(null);
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    setStartIndex((prev) => {
      const maxStart = Math.max(0, cards.length - MAX_VIEWPORT_CARDS);
      return Math.min(prev, maxStart);
    });
  }, [cards.length]);

  const hasMultiple = cards.length > MAX_VIEWPORT_CARDS;
  const visibleCards = useMemo(
    () => (hasMultiple ? cards.slice(startIndex, startIndex + MAX_VIEWPORT_CARDS) : cards),
    [cards, hasMultiple, startIndex],
  );
  const hasPrev = hasMultiple && startIndex > 0;
  const hasNext = hasMultiple && startIndex + MAX_VIEWPORT_CARDS < cards.length;

  const lastWheelTimeRef = useRef(0);
  const handleWheel = (event: React.WheelEvent) => {
    if (!hasMultiple) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 160) return;
    const delta = event.deltaY || event.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTimeRef.current = now;
    if (delta > 0) {
      setStartIndex((prev) => Math.min(cards.length - MAX_VIEWPORT_CARDS, prev + 1));
    } else {
      setStartIndex((prev) => Math.max(0, prev - 1));
    }
  };

  return (
    <div
      ref={stackRef}
      className="overlay-cards"
      data-card-count={cards.length}
      data-visible-count={visibleCards.length}
      data-paged={hasMultiple ? "true" : undefined}
      onWheel={handleWheel}
    >
      {hasPrev && (
        <OverlayNavArrow
          direction="up"
          onClick={() => setStartIndex((prev) => Math.max(0, prev - 1))}
        />
      )}
      {visibleCards.map((card, idx) => {
        const actualIndex = startIndex + idx;
        const key = card.accountId || `${card.provider}-${actualIndex}`;
        const primary = actualIndex === 0;
        return (
          <div
            key={key}
            className="overlay-card-slot"
            {...{
              [OVERLAY_CARD_INDEX_ATTR]: actualIndex,
              [OVERLAY_CARD_PROVIDER_ATTR]: card.provider,
              [OVERLAY_CARD_ACCOUNT_ID_ATTR]: card.accountId || "",
            }}
          >
            <OverlayCard
              data={card}
              avatarError={primary ? avatarError : Boolean(extraAvatarErrors[key])}
              setAvatarError={
                primary
                  ? setAvatarError
                  : (value: boolean) => setExtraAvatarErrors((prev) => ({ ...prev, [key]: value }))
              }
              showTooltip={showTooltip && actualIndex === activeIndex}
              tooltipText={actualIndex === activeIndex ? tooltipText : null}
            />
          </div>
        );
      })}
      {hasNext && (
        <OverlayNavArrow
          direction="down"
          onClick={() =>
            setStartIndex((prev) => Math.min(cards.length - MAX_VIEWPORT_CARDS, prev + 1))
          }
        />
      )}
    </div>
  );
};
