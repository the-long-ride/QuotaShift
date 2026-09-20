import type { OverlayAccountData, OverlaySingleBar } from "./overlay-types";

export interface MonitoredTrayInfo {
  provider: OverlayAccountData["provider"];
  singleBars: OverlaySingleBar[];
  quotaRows: NonNullable<OverlayAccountData["quotaRows"]>;
}

const fallbackBars = (payload: OverlayAccountData): OverlaySingleBar[] => {
  const bars: OverlaySingleBar[] = [];
  if (payload.fiveHourPercent != null) {
    bars.push({ label: "5H", percent: payload.fiveHourPercent });
  }
  if (payload.weeklyPercent != null) {
    bars.push({ label: "WK", percent: payload.weeklyPercent });
  }
  return bars;
};

export const buildMonitoredTrayInfo = (payload: OverlayAccountData): MonitoredTrayInfo => ({
  provider: payload.provider,
  singleBars:
    payload.singleBars?.length || payload.quotaRows?.length
      ? (payload.singleBars ?? [])
      : fallbackBars(payload),
  quotaRows: payload.quotaRows ?? [],
});
