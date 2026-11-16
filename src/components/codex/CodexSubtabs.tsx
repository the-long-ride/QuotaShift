import React from "react";

interface CodexSubtabsProps {
  codexSection: "accounts" | "pools";
  onChange: (section: "accounts" | "pools") => void;
}

export const CodexSubtabs: React.FC<CodexSubtabsProps> = ({ codexSection, onChange }) => (
  <div className="codex-subtabs-wrap">
    <div className="codex-subtabs" role="tablist" aria-label="Codex views">
      <button
        type="button"
        role="tab"
        aria-selected={codexSection === "accounts"}
        data-tooltip="Switch to Codex accounts view"
        className={`codex-subtab ${codexSection === "accounts" ? "codex-subtab--active" : ""}`}
        onClick={() => onChange("accounts")}
      >
        Accounts
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={codexSection === "pools"}
        data-tooltip="Switch to Codex model pools view"
        className={`codex-subtab ${codexSection === "pools" ? "codex-subtab--active" : ""}`}
        onClick={() => onChange("pools")}
      >
        Model Pools
      </button>
    </div>
  </div>
);
