import React from "react";

interface CodexModelPoolV2NameFieldsProps {
  displayName: string;
  publicModelName: string;
  onDisplayNameChange: (value: string) => void;
  onPublicModelNameChange: (value: string) => void;
}

export const CodexModelPoolV2NameFields: React.FC<CodexModelPoolV2NameFieldsProps> = ({
  displayName,
  publicModelName,
  onDisplayNameChange,
  onPublicModelNameChange,
}) => (
  <div className="qs-model-pool-form-split">
    <label className="codex-pool-name-label" htmlFor="qs-model-pool-name">
      Pool name
      <input
        id="qs-model-pool-name"
        className="codex-label-input codex-label-input--full"
        value={displayName}
        onChange={(event) => onDisplayNameChange(event.target.value)}
        placeholder="My model pool"
        autoFocus
      />
      <span className="codex-model-selection-hint">Internal display label</span>
    </label>
    <label className="codex-pool-name-label" htmlFor="qs-model-pool-alias">
      Public model name (alias)
      <input
        id="qs-model-pool-alias"
        className="codex-label-input codex-label-input--full"
        value={publicModelName}
        onChange={(event) => onPublicModelNameChange(event.target.value)}
        placeholder="coding-primary"
        spellCheck={false}
      />
      <span className="codex-model-selection-hint">
        Unique among enabled pools · client-visible alias
      </span>
    </label>
  </div>
);
