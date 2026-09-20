import type { ClaudeAccountUsageStatus } from "../common/types";

export type ClaudeRefreshRequest = (
  force?: boolean,
  maxAgeSecs?: number,
  refreshAccountId?: string | null,
) => Promise<ClaudeAccountUsageStatus[]>;

export interface RunClaudeAccountRefreshParams {
  accountId: string;
  platformVisible: boolean;
  statuses: ClaudeAccountUsageStatus[];
  requestStatuses: ClaudeRefreshRequest;
  onRefreshingChange: (refreshing: boolean) => void;
}

export interface ClaudeAccountRefreshResult {
  attempted: boolean;
  error: unknown | null;
}

export async function runClaudeAccountRefresh({
  accountId,
  platformVisible,
  statuses,
  requestStatuses,
  onRefreshingChange,
}: RunClaudeAccountRefreshParams): Promise<ClaudeAccountRefreshResult> {
  const status = statuses.find((item) => item.account.id === accountId);
  if (!platformVisible || !status || status.suspended) {
    return { attempted: false, error: null };
  }

  onRefreshingChange(true);
  try {
    await requestStatuses(true, 1, accountId);
    return { attempted: true, error: null };
  } catch (error) {
    return { attempted: true, error };
  } finally {
    onRefreshingChange(false);
  }
}
