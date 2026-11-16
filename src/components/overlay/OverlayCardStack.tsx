import React, { useEffect, useMemo, useRef, useState } from "react";
import { useMaxMonitoredCards } from "../../hooks/desktop/useMaxMonitoredCards";
import type { CircleOrientation } from "../../utils/common/overlay/circle-layout";
import { MAX_MONITORED_CARDS_DEFAULT } from "../../utils/common/settings/max-monitored-cards";
import { OverlayCard } from "./OverlayCard";
import { OverlayNavArrow } from "./OverlayNavArrow";
import type { OverlayAccountData } from "./OverlayApp";

export const OVERLAY_CARD_INDEX_ATTR = "data-overlay-card-index";
export const OVERLAY_CARD_PROVIDER_ATTR = "data-overlay-card-provider";
export const OVERLAY_CARD_ACCOUNT_ID_ATTR = "data-overlay-card-account-id";

export const MAX_VIEWPORT_CARDS = MAX_MONITORED_CARDS_DEFAULT;

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
  orientation?: CircleOrientation;
  avatarError: boolean;
  setAvatarError: (value: boolean) => void;
  showTooltip?: boolean;
  tooltipText?: string | null;
  activeIndex?: number;
  onHoverCard?: (data: OverlayAccountData, element: HTMLElement) => void;
  onLeaveCard?: () => void;
}

/** Renders tracked accounts stacked vertically or horizontally, limiting viewport to the configured max (default 3) with pagination. */
export const OverlayCardStack: React.FC<OverlayCardStackProps> = ({
  cards,
  orientation = "vertical",
  avatarError,
  setAvatarError,
  showTooltip = false,
  tooltipText = null,
  activeIndex = 0,
  onHoverCard,
  onLeaveCard,
}) => {
  const maxViewportCards = useMaxMonitoredCards();
  const [extraAvatarErrors, setExtraAvatarErrors] = useState<Record<string, boolean>>({});
  const stackRef = useRef<HTMLDivElement>(null);
  const [startIndex, setStartIndex] = useState(0);

  useEffect(() => {
    setStartIndex((prev) => {
      const maxStart = Math.max(0, cards.length - maxViewportCards);
      return Math.min(prev, maxStart);
    });
  }, [cards.length, maxViewportCards]);

  const hasMultiple = cards.length > maxViewportCards;
  const visibleCards = useMemo(
    () => (hasMultiple ? cards.slice(startIndex, startIndex + maxViewportCards) : cards),
    [cards, hasMultiple, maxViewportCards, startIndex],
  );
  const hasPrev = hasMultiple && startIndex > 0;
  const hasNext = hasMultiple && startIndex + maxViewportCards < cards.length;

  const lastWheelTimeRef = useRef(0);
  const handleWheel = (event: React.WheelEvent) => {
    if (!hasMultiple) return;
    const now = Date.now();
    if (now - lastWheelTimeRef.current < 160) return;
    const delta = event.deltaY || event.deltaX;
    if (Math.abs(delta) < 8) return;
    lastWheelTimeRef.current = now;
    if (delta > 0) {
      setStartIndex((prev) => Math.min(cards.length - maxViewportCards, prev + 1));
    } else {
      setStartIndex((prev) => Math.max(0, prev - 1));
    }
  };

  const prevDir = orientation === "horizontal" ? "left" : "up";
  const nextDir = orientation === "horizontal" ? "right" : "down";

  return (
    <div
      ref={stackRef}
      className={`overlay-cards overlay-cards--${orientation}`}
      data-orientation={orientation}
      data-card-count={cards.length}
      data-visible-count={visibleCards.length}
      data-paged={hasMultiple ? "true" : undefined}
      onWheel={handleWheel}
      onMouseLeave={onLeaveCard}
    >
      {hasPrev && (
        <OverlayNavArrow
          direction={prevDir}
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
            onMouseEnter={(event) => onHoverCard?.(card, event.currentTarget)}
            onMouseMove={(event) => onHoverCard?.(card, event.currentTarget)}
            onMouseLeave={onLeaveCard}
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
          direction={nextDir}
          onClick={() =>
            setStartIndex((prev) => Math.min(cards.length - maxViewportCards, prev + 1))
          }
        />
      )}
    </div>
  );
};
