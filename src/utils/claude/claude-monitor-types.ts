export type ClaudeMonitorSource = "statusLine" | "localTranscript" | "none";

export interface ClaudeObservedUsageWindow {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
  processedTokens: number;
}

export interface ClaudeObservedUsage {
  fiveHour: ClaudeObservedUsageWindow;
  sevenDay: ClaudeObservedUsageWindow;
  capturedAtMs: number;
}

export interface ClaudeRateLimitWindow {
  usedPercentage: number | null;
  resetsAt: number | null;
}

export interface ClaudeSessionSnapshot {
  sessionId: string;
  sessionName: string | null;
  modelId: string | null;
  modelDisplayName: string | null;
  claudeCodeVersion: string | null;
  currentDir: string | null;
  projectDir: string | null;
  capturedAtMs: number;
  totalCostUsd: number | null;
  totalDurationMs: number | null;
  totalApiDurationMs: number | null;
  totalInputTokens: number | null;
  totalOutputTokens: number | null;
  contextWindowSize: number | null;
  contextUsedPercentage: number | null;
  contextRemainingPercentage: number | null;
  currentInputTokens: number | null;
  currentOutputTokens: number | null;
  cacheCreationInputTokens: number | null;
  cacheReadInputTokens: number | null;
  fiveHour: ClaudeRateLimitWindow | null;
  sevenDay: ClaudeRateLimitWindow | null;
}

export interface ClaudeMonitorStatus {
  installed: boolean;
  settingsPath: string | null;
  source: ClaudeMonitorSource;
  session: ClaudeSessionSnapshot | null;
  localUsage: ClaudeObservedUsage | null;
  error: string | null;
}
