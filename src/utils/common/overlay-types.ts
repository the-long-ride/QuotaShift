export interface OverlayQuotaRow {
  label: string;
  fiveHourPercent: number | null;
  weeklyPercent: number | null;
}

export interface OverlaySingleBar {
  label: string;
  percent: number | null;
}

export interface OverlayAccountData {
  provider: "antigravity" | "codex" | "claude";
  accountId?: string | null;
  label: string;
  email?: string | null;
  avatarUrl?: string | null;
  tier?: string | null;
  fiveHourPercent?: number | null;
  weeklyPercent?: number | null;
  singleBars?: OverlaySingleBar[];
  quotaRows?: OverlayQuotaRow[];
  loading?: boolean;
  resetCount?: number | null;
  resetNearestExpiresAt?: string | null;
}
