import React from "react";
import { CommonDropdown } from "../../common/CommonDropdown";

interface ModelChoice {
  id: string;
  label: string;
  tier: string;
  supportCount: number;
}

interface CodexModelPoolV2ModelFieldProps {
  selectedModel: string;
  modelSelectionMode: string;
  upstreamModelId: string;
  scannedModels: ModelChoice[];
  valid: boolean;
  isSiwc: boolean;
  onSelect: (id: string) => void;
  onManualChange: (model: string) => void;
}

export const CodexModelPoolV2ModelField: React.FC<CodexModelPoolV2ModelFieldProps> = ({
  selectedModel,
  modelSelectionMode,
  upstreamModelId,
  scannedModels,
  valid,
  isSiwc,
  onSelect,
  onManualChange,
}) => (
  <div className="codex-pool-name-label qs-model-pool-model-field">
    <label className="codex-field-label" htmlFor="qs-model-pool-upstream">
      Upstream model ID
    </label>
    <div
      className={
        modelSelectionMode === "manual"
          ? "qs-model-pool-model-row qs-model-pool-form-split"
          : "qs-model-pool-model-row"
      }
    >
      <CommonDropdown
        id="qs-model-pool-upstream"
        value={selectedModel}
        onChange={onSelect}
        options={[
          { value: "__qs_manual_model_entry__", label: "Enter model ID manually" },
          ...scannedModels.map((item) => ({
            value: item.id,
            label: item.label,
            sublabel: `${item.tier} · ${item.supportCount} account(s)`,
          })),
        ]}
        placeholder={isSiwc ? "Choose SIWC model" : "Choose model from scans"}
        tooltip={
          isSiwc
            ? "Account-specific ChatGPT plan models"
            : "Models scanned from selected Codex accounts"
        }
        width="100%"
      />
      {modelSelectionMode === "manual" && (
        <input
          className="codex-label-input codex-label-input--full"
          value={upstreamModelId}
          onChange={(event) => onManualChange(event.target.value)}
          placeholder="Type exact upstream model ID (e.g. gpt-5.3-codex)"
          spellCheck={false}
          aria-label="Manual upstream model ID"
        />
      )}
    </div>
    <span className="codex-model-selection-hint">
      {scannedModels.length
        ? isSiwc
          ? "Models common to every selected SIWC account."
          : "Models from selected Codex account scans. Manual override available."
        : isSiwc
          ? "Connect SIWC accounts and fetch their model catalogs first."
          : "No fresh Codex model scans. Select members or enter a model ID manually."}
    </span>
    {modelSelectionMode === "discovered" && !valid && (
      <div className="codex-model-validation codex-model-validation--warning">
        Selected model is not confirmed for every pool member.
      </div>
    )}
  </div>
);
