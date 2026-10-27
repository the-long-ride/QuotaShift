import {
  DEFAULT_CLI_ROTATION_PREFERENCES,
  DEFAULT_CONTINUATION_PROMPT,
  type CliRotationPreferencesV1,
} from "./types.js";

export const CLI_ROTATION_PREFERENCES_KEY = "quotashift_cli_rotation_prompt_v1";

type StorageReader = Pick<Storage, "getItem">;
type PreferenceStorage = Pick<Storage, "getItem" | "setItem">;

export interface PromptValidationResult {
  valid: boolean;
  error?: string;
}

export function validateContinuationPrompt(raw: unknown): PromptValidationResult {
  if (typeof raw !== "string") {
    return { valid: false, error: "Prompt must be a string." };
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: "Continuation prompt cannot be empty." };
  }

  // Unicode length check (maximum 2000 characters)
  const codePoints = Array.from(raw);
  if (codePoints.length > 2000) {
    return {
      valid: false,
      error: `Prompt exceeds maximum length of 2000 characters (found ${codePoints.length}).`,
    };
  }

  // Windows argv safety: reject NUL bytes
  if (raw.includes("\0")) {
    return { valid: false, error: "Prompt cannot contain NUL bytes." };
  }

  return { valid: true };
}

const defaultReader: StorageReader = {
  getItem: () => null,
};

const defaultStorage: PreferenceStorage = {
  getItem: () => null,
  setItem: () => {},
};

function resolveReader(storage?: StorageReader): StorageReader {
  if (storage) return storage;
  return typeof localStorage !== "undefined" ? localStorage : defaultReader;
}

function resolveStorage(storage?: PreferenceStorage): PreferenceStorage {
  if (storage) return storage;
  return typeof localStorage !== "undefined" ? localStorage : defaultStorage;
}

export function loadCliRotationPreferences(storage?: StorageReader): CliRotationPreferencesV1 {
  const s = resolveReader(storage);
  try {
    const raw = s.getItem(CLI_ROTATION_PREFERENCES_KEY);
    if (!raw) return { ...DEFAULT_CLI_ROTATION_PREFERENCES };

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_CLI_ROTATION_PREFERENCES };
    }

    const validation = validateContinuationPrompt(parsed.continuationPrompt);
    const continuationPrompt = validation.valid
      ? (parsed.continuationPrompt as string)
      : DEFAULT_CONTINUATION_PROMPT;

    return {
      enabled: Boolean(parsed.enabled),
      continuationPrompt,
      requiredFreshSamples:
        typeof parsed.requiredFreshSamples === "number" &&
        parsed.requiredFreshSamples >= 1 &&
        parsed.requiredFreshSamples <= 10
          ? parsed.requiredFreshSamples
          : DEFAULT_CLI_ROTATION_PREFERENCES.requiredFreshSamples,
      minSampleSeparationSecs:
        typeof parsed.minSampleSeparationSecs === "number" && parsed.minSampleSeparationSecs >= 1
          ? parsed.minSampleSeparationSecs
          : DEFAULT_CLI_ROTATION_PREFERENCES.minSampleSeparationSecs,
      gracefulWaitSecs:
        typeof parsed.gracefulWaitSecs === "number" && parsed.gracefulWaitSecs >= 1
          ? parsed.gracefulWaitSecs
          : DEFAULT_CLI_ROTATION_PREFERENCES.gracefulWaitSecs,
      autoRestartAfterAppStart: Boolean(parsed.autoRestartAfterAppStart),
    };
  } catch {
    return { ...DEFAULT_CLI_ROTATION_PREFERENCES };
  }
}

export function saveCliRotationPreferences(
  updates: Partial<CliRotationPreferencesV1>,
  storage?: PreferenceStorage,
): CliRotationPreferencesV1 {
  const s = resolveStorage(storage);
  const current = loadCliRotationPreferences(s);
  const nextPrompt =
    updates.continuationPrompt !== undefined
      ? updates.continuationPrompt
      : current.continuationPrompt;

  const validation = validateContinuationPrompt(nextPrompt);
  const continuationPrompt = validation.valid ? nextPrompt : current.continuationPrompt;

  const next: CliRotationPreferencesV1 = {
    ...current,
    ...updates,
    continuationPrompt,
  };

  s.setItem(CLI_ROTATION_PREFERENCES_KEY, JSON.stringify(next));
  return next;
}

export function resetCliRotationPreferences(
  storage?: Pick<Storage, "setItem">,
): CliRotationPreferencesV1 {
  const s = storage ?? (typeof localStorage !== "undefined" ? localStorage : defaultStorage);
  const defaults = { ...DEFAULT_CLI_ROTATION_PREFERENCES };
  s.setItem(CLI_ROTATION_PREFERENCES_KEY, JSON.stringify(defaults));
  return defaults;
}

export function resetContinuationPrompt(storage?: PreferenceStorage): CliRotationPreferencesV1 {
  return saveCliRotationPreferences({ continuationPrompt: DEFAULT_CONTINUATION_PROMPT }, storage);
}

function hashString(str: string): string {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export interface PromptSnapshot {
  prompt: string;
  hash: string;
  snapshotAt: number;
}

export function snapshotContinuationPrompt(storage?: StorageReader): PromptSnapshot {
  const prefs = loadCliRotationPreferences(storage);
  return {
    prompt: prefs.continuationPrompt,
    hash: hashString(prefs.continuationPrompt),
    snapshotAt: Date.now(),
  };
}
