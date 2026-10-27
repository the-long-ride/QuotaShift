export type CliProvider = "agy" | "codex";

export type CliQuotaWindowKind = "5h" | "weekly" | "monthly";

export interface CliRotationPoolV1 {
  id: string;
  provider: CliProvider;
  name: string;
  accountIds: string[];
  enabled: boolean;
  autoSwitch: boolean;
  triggerWindows: CliQuotaWindowKind[];
  fallbackLatestEnabled: boolean;
  switchWhenIdleOnly: boolean;
}

export interface CliRotationBindingsV1 {
  agyActivePoolId: string | null;
  codexActivePoolId: string | null;
}

export interface CliRotationPreferencesV1 {
  enabled: boolean;
  continuationPrompt: string;
  requiredFreshSamples: number;
  minSampleSeparationSecs: number;
  gracefulWaitSecs: number;
  autoRestartAfterAppStart: boolean;
}

export const DEFAULT_CONTINUATION_PROMPT = "continue remaining works";

export const DEFAULT_CLI_ROTATION_PREFERENCES: CliRotationPreferencesV1 = {
  enabled: false,
  continuationPrompt: DEFAULT_CONTINUATION_PROMPT,
  requiredFreshSamples: 2,
  minSampleSeparationSecs: 5,
  gracefulWaitSecs: 15,
  autoRestartAfterAppStart: false,
};
