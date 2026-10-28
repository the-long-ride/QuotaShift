import React from "react";
import { CommonDropdown } from "../../common/CommonDropdown";
import type { PoolReasoningEffort } from "../../../utils/codex/pools/codex-pools-v2-types";
import {
  defaultBudgetForEffort,
  effortForThinkingBudget,
} from "../../../utils/codex/pools/codex-pools-v2";

interface CodexModelPoolV2LimitsFieldsProps {
  maxContextWindowTokens: number;
  thinkingBudgetTokens: number;
  reasoningEffort: PoolReasoningEffort;
  onChangeLimits: (next: {
    maxContextWindowTokens?: number;
    thinkingBudgetTokens?: number;
    reasoningEffort?: PoolReasoningEffort;
  }) => void;
}

const CONTEXT_PRESETS: Array<{ label: string; tokens: number }> = [
  { label: "128k", tokens: 128_000 },
  { label: "200k", tokens: 200_000 },
  { label: "400k", tokens: 400_000 },
  { label: "1M", tokens: 1_000_000 },
];

export const CodexModelPoolV2LimitsFields: React.FC<CodexModelPoolV2LimitsFieldsProps> = ({
  maxContextWindowTokens,
  thinkingBudgetTokens,
  reasoningEffort,
  onChangeLimits,
}) => (
  <div className="qs-model-pool-limits-section">
    <div className="codex-pool-name-label">
      <div className="qs-model-pool-field-header">
        <label htmlFor="qs-model-pool-max-context">Max context window (tokens)</label>
        <div className="qs-model-pool-presets" role="group" aria-label="Context window presets">
          {CONTEXT_PRESETS.map((preset) => (
            <button
              key={preset.tokens}
              type="button"
              className={`qs-model-pool-preset-btn${
                maxContextWindowTokens === preset.tokens ? " qs-model-pool-preset-btn--active" : ""
              }`}
              data-tooltip={`Set context window to ${preset.tokens.toLocaleString()} tokens`}
              onClick={() => onChangeLimits({ maxContextWindowTokens: preset.tokens })}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <input
        id="qs-model-pool-max-context"
        type="number"
        min={1024}
        step={1024}
        className="codex-label-input codex-label-input--full"
        value={maxContextWindowTokens}
        onChange={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          onChangeLimits({
            maxContextWindowTokens: Number.isFinite(parsed) && parsed > 0 ? parsed : 200_000,
          });
        }}
      />
    </div>
    <div className="qs-model-pool-form-split">
      <div className="codex-pool-name-label qs-model-pool-dropdown-field">
        <label htmlFor="qs-model-pool-reasoning-effort">Thinking effort (OpenAI)</label>
        <CommonDropdown
          id="qs-model-pool-reasoning-effort"
          value={reasoningEffort}
          onChange={(value) => {
            const effort = value as PoolReasoningEffort;
            onChangeLimits({
              reasoningEffort: effort,
              thinkingBudgetTokens: defaultBudgetForEffort(effort),
            });
          }}
          tooltip="OpenAI default reasoning effort is medium; updates thinking budget automatically"
          options={[
            { value: "minimal", label: "Minimal (1,024 tok)" },
            { value: "low", label: "Low (2,048 tok)" },
            { value: "medium", label: "Medium · OpenAI default (8,192 tok)" },
            { value: "high", label: "High (16,384 tok)" },
            { value: "xhigh", label: "Extra high (32,768 tok)" },
          ]}
          width="100%"
        />
      </div>
      <label className="codex-pool-name-label" htmlFor="qs-model-pool-thinking-budget">
        Thinking budget (tokens)
        <input
          id="qs-model-pool-thinking-budget"
          type="number"
          min={256}
          step={512}
          className="codex-label-input codex-label-input--full"
          value={thinkingBudgetTokens}
          onChange={(event) => {
            const parsed = Number.parseInt(event.target.value, 10);
            const budget = Number.isFinite(parsed) && parsed >= 256 ? parsed : 8_192;
            onChangeLimits({
              thinkingBudgetTokens: budget,
              reasoningEffort: effortForThinkingBudget(budget),
            });
          }}
        />
      </label>
    </div>
    <span className="codex-model-selection-hint">
      Synced with Claude Code effort ({reasoningEffort}) · OpenAI default is medium (8,192 tokens)
    </span>
  </div>
);
