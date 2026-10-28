import React from "react";
import type { CodexTierModelGroup } from "../../../utils/codex/codex-models";

export const CodexModelOptionHeading: React.FC<{ group: CodexTierModelGroup }> = ({ group }) => (
  <div className="codex-model-option-heading">
    <span>{group.tier}</span>
    <span>
      {group.scannedCount}/{group.accountCount} scanned
    </span>
  </div>
);
