import React from "react";
import { CommonDropdown } from "../common/CommonDropdown";
import type { PoolAuthMode, PoolRoutingPolicy } from "../../utils/codex/codex-pools-v2-types";

interface CodexModelPoolV2PoliciesProps {
  authMode: PoolAuthMode;
  routingPolicy: PoolRoutingPolicy;
  onAuthChange: (value: PoolAuthMode) => void;
  onPolicyChange: (value: PoolRoutingPolicy) => void;
}

export const CodexModelPoolV2Policies: React.FC<CodexModelPoolV2PoliciesProps> = ({
  authMode,
  routingPolicy,
  onAuthChange,
  onPolicyChange,
}) => (
  <div className="qs-model-pool-form-split">
    <div className="codex-pool-name-label qs-model-pool-dropdown-field">
      <label htmlFor="qs-model-pool-auth">Authorization</label>
      <CommonDropdown
        id="qs-model-pool-auth"
        value={authMode}
        onChange={(value) => onAuthChange(value as PoolAuthMode)}
        tooltip="Select authorized upstream credentials"
        options={[
          { value: "openai-api-key", label: "API key (billed separately)" },
          { value: "siwc", label: "Sign in with ChatGPT (SIWC)" },
        ]}
        width="100%"
      />
    </div>
    <div className="codex-pool-name-label qs-model-pool-dropdown-field">
      <label htmlFor="qs-model-pool-policy">Routing policy</label>
      <CommonDropdown
        id="qs-model-pool-policy"
        value={routingPolicy}
        onChange={(value) => onPolicyChange(value as PoolRoutingPolicy)}
        tooltip="Select account routing policy"
        options={[
          { value: "cache-aware", label: "Cache-aware" },
          { value: "balanced", label: "Balanced" },
          { value: "priority", label: "Priority" },
        ]}
        width="100%"
      />
    </div>
  </div>
);
