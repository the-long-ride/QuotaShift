import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  OVERLAY_CARD_ACCOUNT_ID_ATTR,
  OVERLAY_CARD_INDEX_ATTR,
  OVERLAY_CARD_PROVIDER_ATTR,
} from "../../utils/common/overlay/overlay-card-target";
import type { CircleOrientation } from "../../utils/common/overlay/circle-layout";
import type { OverlayAccountData } from "./OverlayApp";
import { useMaxMonitoredCards } from "../../hooks/desktop/useMaxMonitoredCards";
import { OverlayCircleNode } from "./OverlayCircleNode";
import { OverlayNavArrow } from "./OverlayNavArrow";

interface OverlayCircleStackProps {
  cards: OverlayAccountData[];
  orientation: CircleOrientation;
  avatarError: boolean;
  setAvatarError: (value: boolean) => void;
  onHoverNode: (data: OverlayAccountData, element: HTMLElement) => void;
  onLeaveNode: () => void;
  onContextMenuNode: (
    data: OverlayAccountData,
    element: HTMLElement,
    event: React.MouseEvent,
  ) => void;
}

/**
 * Floating circular overlay stack supporting both vertical and horizontal layouts with up to
 * the configured max visible accounts (default 3, 1–20) and pagination arrows/wheel scrolling.
 */
export const OverlayCircleStack: React.FC<OverlayCircleStackProps> = ({
  cards,
  orientation,
  avatarError,
  setAvatarError,
  onHoverNode,
  onLeaveNode,
  onContextMenuNode,
}) => {
  const maxViewportCards = useMaxMonitoredCards();
  const [extraAvatarErrors, setExtraAvatarErrors] = useState<Record<string, boolean>>({});
  const [startIndex, setStartIndex] = useState(0);
  const lastWheelTimeRef = useRef(0);

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
  const prevDir = orientation === "horizontal" ? "left" : "up";
  const nextDir = orientation === "horizontal" ? "right" : "down";

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

  return (
    <div
      className={`overlay-cards overlay-circle-cards overlay-circle-cards--${orientation}`}
      data-orientation={orientation}
      data-card-count={cards.length}
      data-visible-count={visibleCards.length}
      data-paged={hasMultiple ? "true" : undefined}
      onMouseLeave={onLeaveNode}
      onWheel={handleWheel}
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
            className="overlay-card-slot overlay-circle-slot"
            {...{
              [OVERLAY_CARD_INDEX_ATTR]: actualIndex,
              [OVERLAY_CARD_PROVIDER_ATTR]: card.provider,
              [OVERLAY_CARD_ACCOUNT_ID_ATTR]: card.accountId || "",
            }}
          >
            <OverlayCircleNode
              data={card}
              avatarError={primary ? avatarError : Boolean(extraAvatarErrors[key])}
              setAvatarError={
                primary
                  ? setAvatarError
                  : (value: boolean) => setExtraAvatarErrors((prev) => ({ ...prev, [key]: value }))
              }
              onHover={onHoverNode}
              onLeave={onLeaveNode}
              onContextMenu={onContextMenuNode}
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
