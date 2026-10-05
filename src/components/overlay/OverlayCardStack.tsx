import React, { useState } from "react";
import { OverlayCard } from "./OverlayCard";
import type { OverlayAccountData } from "./OverlayApp";

export const OVERLAY_CARD_INDEX_ATTR = "data-overlay-card-index";

/** Index of the stacked card under the pointer; 0 (primary) when outside any card. */
export function resolveHoveredCardIndex(target: HTMLElement | null, count: number): number {
  const raw = target
    ?.closest?.(`[${OVERLAY_CARD_INDEX_ATTR}]`)
    ?.getAttribute(OVERLAY_CARD_INDEX_ATTR);
  const index = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isInteger(index) && index >= 0 && index < count ? index : 0;
}

interface OverlayCardStackProps {
  cards: OverlayAccountData[];
  avatarError: boolean;
  setAvatarError: (value: boolean) => void;
  showTooltip: boolean;
  tooltipText: string | null;
  activeIndex: number;
}

/** Renders the primary tracked account plus up to two extra tracked accounts, stacked. */
export const OverlayCardStack: React.FC<OverlayCardStackProps> = ({
  cards,
  avatarError,
  setAvatarError,
  showTooltip,
  tooltipText,
  activeIndex,
}) => {
  const [extraAvatarErrors, setExtraAvatarErrors] = useState<Record<string, boolean>>({});
  return (
    <div className="overlay-cards" data-card-count={cards.length}>
      {cards.map((card, index) => {
        const key = card.accountId || `${card.provider}-${index}`;
        const primary = index === 0;
        return (
          <div key={key} className="overlay-card-slot" {...{ [OVERLAY_CARD_INDEX_ATTR]: index }}>
            <OverlayCard
              data={card}
              avatarError={primary ? avatarError : Boolean(extraAvatarErrors[key])}
              setAvatarError={
                primary
                  ? setAvatarError
                  : (value: boolean) => setExtraAvatarErrors((prev) => ({ ...prev, [key]: value }))
              }
              showTooltip={showTooltip && index === activeIndex}
              tooltipText={index === activeIndex ? tooltipText : null}
            />
          </div>
        );
      })}
    </div>
  );
};
