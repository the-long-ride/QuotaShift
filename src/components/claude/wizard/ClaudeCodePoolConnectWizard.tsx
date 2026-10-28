import React, { useEffect, useState } from "react";
import type { CodexModelPoolV2 } from "../../../utils/codex/pools/codex-pools-v2-types";
import {
  DEFAULT_SLOT_HINT,
  useClaudeCodePoolConnector,
} from "../../../hooks/claude/gateway/useClaudeCodePoolConnector";
import { AccountModalLayout } from "../../common/accounts/AccountModalLayout";
import { CommonDropdown } from "../../common/CommonDropdown";
import { ClaudeConnectionModeStep } from "./ClaudeConnectionModeStep";
import { ClaudeGatewayConnections } from "./ClaudeGatewayConnections";
import { ClaudeProfileCreator } from "../profiles/ClaudeProfileCreator";
import { ClaudeWizardExperimentalDialog } from "./ClaudeWizardExperimentalDialog";

export interface ClaudeCodePoolConnectWizardProps {
  isOpen: boolean;
  pools: CodexModelPoolV2[];
  onClose: () => void;
}

const SLOTS = ["Sonnet", "Opus", "Haiku", "Fable", "Default"] as const;
const STEP_LABELS = ["Installation", "Model mapping", "Connection"] as const;

export const ClaudeCodePoolConnectWizard: React.FC<ClaudeCodePoolConnectWizardProps> = ({
  isOpen,
  pools,
  onClose,
}) => {
  const [step, setStep] = useState(1);
  const [warningOpen, setWarningOpen] = useState(false);
  const connector = useClaudeCodePoolConnector();
  const enabledPools = pools.filter((pool) => pool.enabled);

  useEffect(() => {
    if (!isOpen) {
      setStep(1);
      setWarningOpen(false);
    }
  }, [isOpen]);

  const hasDefaultMapping = enabledPools.some(
    (pool) => pool.publicModelName === connector.modelMappings.default,
  );
  const canAdvance =
    step === 1
      ? Boolean(connector.selectedInstallation && connector.selectedProfile)
      : step === 2
        ? enabledPools.length > 0 && hasDefaultMapping
        : true;

  const footerButtons = (
    <>
      {step > 1 && (
        <button
          type="button"
          className="dialog-btn dialog-btn--secondary claude-wizard-back"
          data-tooltip="Return to previous setup step"
          onClick={() => setStep((previous) => previous - 1)}
        >
          Back
        </button>
      )}
      <button
        type="button"
        className="dialog-btn dialog-btn--secondary"
        data-tooltip="Cancel Claude Code connection setup"
        onClick={onClose}
      >
        Cancel
      </button>
      {step < 3 ? (
        <button
          type="button"
          className="dialog-btn dialog-btn--primary"
          data-tooltip={
            canAdvance ? "Continue to next setup step" : "Complete the required selections"
          }
          disabled={!canAdvance}
          onClick={() => setStep((previous) => previous + 1)}
        >
          Next
        </button>
      ) : (
        <button
          type="button"
          className="dialog-btn dialog-btn--primary"
          data-tooltip="Validate and connect the selected Claude Code profile"
          disabled={connector.isConnecting || !hasDefaultMapping}
          onClick={async () => {
            const connected = await connector.connect();
            if (connected) onClose();
          }}
        >
          {connector.isConnecting ? "Connecting…" : "Connect"}
        </button>
      )}
    </>
  );

  return (
    <>
      <AccountModalLayout
        isOpen={isOpen}
        onClose={onClose}
        title="Connect Claude Code"
        icon={
          <span className="claude-wizard-icon" aria-hidden="true">
            {"◫"}
          </span>
        }
        headerActions={
          <button
            type="button"
            className="claude-wizard-header-warning"
            data-tooltip="Read experimental model routing limitations"
            aria-label="Experimental routing information"
            onClick={() => setWarningOpen(true)}
          >
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden="true">
              <path
                d="M10 2.5 18 17H2L10 2.5Z"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path
                d="M10 7.5v4.5M10 14.5h.01"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span>Experimental</span>
          </button>
        }
        dialogClassName="claude-pool-wizard"
        bodyClassName="claude-wizard-body"
        footerButtons={footerButtons}
      >
        <div className="claude-wizard-progress" aria-label={`Step ${step} of 3`}>
          {STEP_LABELS.map((label, index) => (
            <div
              key={label}
              className={`claude-wizard-progress-step${step === index + 1 ? " claude-wizard-progress-step--current" : ""}${step > index + 1 ? " claude-wizard-progress-step--done" : ""}`}
              aria-current={step === index + 1 ? "step" : undefined}
            >
              <span className="claude-wizard-step-number">{index + 1}</span>
              <span>{label}</span>
            </div>
          ))}
        </div>

        {step === 1 && (
          <ClaudeGatewayConnections
            isOpen={isOpen}
            profiles={connector.profiles}
            executablePath={connector.selectedInstallation || connector.installations[0]?.path}
          />
        )}

        {step === 1 && (
          <section
            className="claude-wizard-section"
            aria-label="Choose Claude installation and profile"
          >
            <div className="claude-wizard-section-heading">Select CLI installation and profile</div>
            <div className="claude-wizard-field">
              <label className="form-label" htmlFor="claude-install-select">
                Claude executable
              </label>
              <CommonDropdown
                id="claude-install-select"
                value={connector.selectedInstallation || ""}
                onChange={(val) => connector.setInstallation(val)}
                placeholder="Choose detected installation"
                tooltip="Select Claude Code CLI installation"
                options={[
                  { value: "", label: "Choose a detected installation..." },
                  ...connector.installations.map((installation) => ({
                    value: installation.path,
                    label: installation.path,
                    sublabel: installation.provenance,
                  })),
                ]}
                width="100%"
              />
              {connector.installations.length === 0 && (
                <div className="form-hint">
                  No native Claude Code CLI was detected in the current Windows installation.
                </div>
              )}
            </div>
            <div className="claude-wizard-field">
              <label className="form-label" htmlFor="claude-profile-select">
                Configuration profile
              </label>
              <CommonDropdown
                id="claude-profile-select"
                value={connector.selectedProfile || ""}
                onChange={(val) => connector.setProfile(val)}
                placeholder="Choose detected profile"
                tooltip="Select Claude Code configuration profile"
                options={[
                  { value: "", label: "Choose a detected profile..." },
                  ...connector.profiles.map((profile) => ({
                    value: profile.id,
                    label: profile.name,
                    sublabel: profile.configDir,
                  })),
                ]}
                width="100%"
              />
              {connector.profiles.length === 0 && (
                <div className="form-hint">No Claude Code configuration profile was detected.</div>
              )}
            </div>
            <ClaudeProfileCreator
              profiles={connector.profiles}
              creating={connector.isCreatingProfile}
              onCreate={connector.createProfile}
            />
          </section>
        )}

        {step === 2 && (
          <section className="claude-wizard-section" aria-label="Map Claude model slots">
            <div className="claude-wizard-section-heading">Map model slots to enabled pools</div>
            {enabledPools.length === 0 && (
              <div className="codex-model-validation codex-model-validation--warning">
                Enable a Codex Model Pool before assigning a Claude model slot.
              </div>
            )}
            <div className="claude-wizard-slot-grid">
              {SLOTS.map((slot) => (
                <div key={slot} className="claude-wizard-field">
                  <label className="form-label" htmlFor={`claude-slot-${slot.toLowerCase()}`}>
                    {slot}
                  </label>
                  <CommonDropdown
                    id={`claude-slot-${slot.toLowerCase()}`}
                    value={connector.modelMappings[slot.toLowerCase()] || ""}
                    onChange={(val) => connector.setSlotMapping(slot.toLowerCase(), val)}
                    placeholder="Unmapped"
                    tooltip={`Select pool for ${slot} slot`}
                    options={[
                      { value: "", label: "Unmapped (default)" },
                      ...enabledPools.map((pool) => ({
                        value: pool.publicModelName,
                        label: pool.publicModelName,
                        sublabel: pool.displayName,
                      })),
                    ]}
                    width="100%"
                  />
                </div>
              ))}
            </div>
            <p className="form-hint">{DEFAULT_SLOT_HINT}</p>
          </section>
        )}

        {step === 3 && (
          <ClaudeConnectionModeStep mode={connector.connectionMode} onChange={connector.setMode} />
        )}

        {connector.lastError && (
          <div
            role="alert"
            className="codex-model-validation codex-model-validation--error claude-wizard-error"
          >
            {connector.lastError}
          </div>
        )}
      </AccountModalLayout>
      <ClaudeWizardExperimentalDialog
        isOpen={isOpen && warningOpen}
        onClose={() => setWarningOpen(false)}
      />
    </>
  );
};
