import React, { useState } from "react";
import type {
  CliProvider,
  CliQuotaWindowKind,
  CliRotationPoolV1,
} from "../../../utils/cli-pools/types";
import { CliPoolAccountList } from "./CliPoolAccountList";
import { CliWarningIcon } from "./CliPoolIcons";
import { CommonSwitch } from "../CommonSwitch";

export interface CliPoolEditorProps {
  provider: CliProvider;
  pool?: CliRotationPoolV1 | null;
  accounts: Array<{
    id: string;
    email?: string;
    label: string;
    lastPlan?: string | null;
    isOAuth?: boolean;
  }>;
  onSave: (pool: CliRotationPoolV1) => void;
  onCancel: () => void;
  formId?: string;
  hideFooterButtons?: boolean;
}

const WINDOWS: Array<{ kind: CliQuotaWindowKind; label: string; desc: string }> = [
  { kind: "5h", label: "5-Hour", desc: "Short-term burst window" },
  { kind: "weekly", label: "Weekly", desc: "Weekly quota allowance" },
  { kind: "monthly", label: "Monthly", desc: "Monthly quota cycle" },
];

export const CliPoolEditor: React.FC<CliPoolEditorProps> = ({
  provider,
  pool,
  accounts,
  onSave,
  onCancel,
  formId = "cli-pool-form",
  hideFooterButtons = false,
}) => {
  const [name, setName] = useState(pool?.name ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(pool?.accountIds ?? []);
  const [enabled, setEnabled] = useState(pool?.enabled ?? false);
  const [autoSwitch, setAutoSwitch] = useState(pool?.autoSwitch ?? false);
  const [triggerWindows, setTriggerWindows] = useState<CliQuotaWindowKind[]>(
    pool?.triggerWindows ?? ["5h", "weekly"],
  );
  const [fallbackLatest, setFallbackLatest] = useState(pool?.fallbackLatestEnabled ?? false);
  const [switchWhenIdle, setSwitchWhenIdle] = useState(pool?.switchWhenIdleOnly ?? true);
  const [error, setError] = useState<string | null>(null);

  const toggleAccount = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSelectAllVisible = (ids: string[]) => {
    setSelectedIds((prev) => Array.from(new Set([...prev, ...ids])));
  };

  const handleClearVisible = (ids: string[]) => {
    const idSet = new Set(ids);
    setSelectedIds((prev) => prev.filter((id) => !idSet.has(id)));
  };

  const moveUp = (index: number) => {
    if (index <= 0) return;
    setSelectedIds((prev) => {
      const copy = [...prev];
      [copy[index - 1], copy[index]] = [copy[index], copy[index - 1]];
      return copy;
    });
  };

  const moveDown = (index: number) => {
    if (index >= selectedIds.length - 1) return;
    setSelectedIds((prev) => {
      const copy = [...prev];
      [copy[index], copy[index + 1]] = [copy[index + 1], copy[index]];
      return copy;
    });
  };

  const toggleWindow = (kind: CliQuotaWindowKind) => {
    setTriggerWindows((prev) =>
      prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind],
    );
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Pool name is required.");
      return;
    }
    if (enabled && autoSwitch && selectedIds.length < 2) {
      setError("An enabled auto-switching pool requires at least 2 member accounts.");
      return;
    }
    if (triggerWindows.length === 0) {
      setError("Select at least one quota trigger window.");
      return;
    }

    const saved: CliRotationPoolV1 = {
      id: pool?.id ?? `clipool-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      provider,
      name: trimmedName,
      accountIds: selectedIds,
      enabled,
      autoSwitch,
      triggerWindows,
      fallbackLatestEnabled: fallbackLatest,
      switchWhenIdleOnly: switchWhenIdle,
    };
    onSave(saved);
  };

  return (
    <form id={formId} onSubmit={handleSubmit} className="cli-pool-editor">
      <div className="cli-pool-form-group">
        <label htmlFor="cli-pool-name" className="cli-pool-label">
          Pool Name
        </label>
        <input
          id="cli-pool-name"
          className="cli-pool-input"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Work Rotation Pool"
          autoFocus
        />
      </div>

      <CliPoolAccountList
        provider={provider}
        accounts={accounts}
        selectedIds={selectedIds}
        onToggleAccount={toggleAccount}
        onMoveUp={moveUp}
        onMoveDown={moveDown}
        onSelectAllVisible={handleSelectAllVisible}
        onClearVisible={handleClearVisible}
      />

      <div className="cli-pool-form-group">
        <span className="cli-pool-label">Trigger Windows</span>
        <div className="cli-pool-windows-row">
          {WINDOWS.map(({ kind, label, desc }) => {
            const isChecked = triggerWindows.includes(kind);
            return (
              <div
                key={kind}
                className={`cli-pool-window-pill ${isChecked ? "cli-pool-window-pill--active" : ""}`}
                onClick={() => toggleWindow(kind)}
                role="presentation"
                data-tooltip={`${label}: ${desc}`}
              >
                <CommonSwitch
                  checked={isChecked}
                  onToggle={() => toggleWindow(kind)}
                  tooltip={`${label}: ${desc}`}
                  ariaLabel={`Toggle ${label} window`}
                />
                <span className="cli-pool-window-title">{label}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="cli-pool-settings-section">
        <span className="cli-pool-label">Rotation & Automation Behavior</span>

        <div
          className="cli-pool-toggle-card"
          onClick={() => setEnabled((prev) => !prev)}
          role="presentation"
        >
          <CommonSwitch
            checked={enabled}
            onToggle={() => setEnabled((prev) => !prev)}
            tooltip="Toggle pool enabled status"
            ariaLabel="Toggle pool enabled status"
          />
          <div className="cli-pool-toggle-copy">
            <span className="cli-pool-toggle-title">Enable this pool</span>
            <span className="cli-pool-toggle-desc">
              Pool can be selected for active CLI rotation when enabled.
            </span>
          </div>
        </div>

        <div
          className="cli-pool-toggle-card"
          onClick={() => setAutoSwitch((prev) => !prev)}
          role="presentation"
        >
          <CommonSwitch
            checked={autoSwitch}
            onToggle={() => setAutoSwitch((prev) => !prev)}
            tooltip="Toggle automatic rotation on quota exhaustion"
            ariaLabel="Toggle automatic rotation on quota exhaustion"
          />
          <div className="cli-pool-toggle-copy">
            <span className="cli-pool-toggle-title">
              Automatic Quota Switching <span className="cli-pool-badge-experimental">Preview</span>
            </span>
            <span className="cli-pool-toggle-desc">
              Automatically rotate to next pool member when an account window is exhausted.
            </span>
          </div>
        </div>

        <div
          className="cli-pool-toggle-card"
          onClick={() => setFallbackLatest((prev) => !prev)}
          role="presentation"
        >
          <CommonSwitch
            checked={fallbackLatest}
            onToggle={() => setFallbackLatest((prev) => !prev)}
            tooltip="Toggle fallback to latest active session"
            ariaLabel="Toggle fallback to latest active session"
          />
          <div className="cli-pool-toggle-copy">
            <span className="cli-pool-toggle-title">Allow Fallback to Latest Session</span>
            <span className="cli-pool-toggle-desc">
              Permit handoff when conversation ID is missing and exactly one CLI instance is
              running.
            </span>
            {fallbackLatest && (
              <div className="cli-pool-risk-hint">
                <CliWarningIcon />
                <span>
                  Strict single-instance safeguard: ignored if multiple sessions are active.
                </span>
              </div>
            )}
          </div>
        </div>

        <div
          className="cli-pool-toggle-card"
          onClick={() => setSwitchWhenIdle((prev) => !prev)}
          role="presentation"
        >
          <CommonSwitch
            checked={switchWhenIdle}
            onToggle={() => setSwitchWhenIdle((prev) => !prev)}
            tooltip="Toggle switch only when process is idle"
            ariaLabel="Toggle switch only when process is idle"
          />
          <div className="cli-pool-toggle-copy">
            <span className="cli-pool-toggle-title">Switch Only When Process Is Idle</span>
            <span className="cli-pool-toggle-desc">
              Waits until the active CLI process completes running commands before swapping tokens.
            </span>
          </div>
        </div>
      </div>

      {error && <div className="cli-pool-form-error">{error}</div>}

      {!hideFooterButtons && (
        <div className="dialog-buttons cli-pool-editor-footer">
          <button
            type="button"
            className="dialog-btn dialog-btn--secondary"
            onClick={onCancel}
            data-tooltip="Cancel pool editing"
          >
            Cancel
          </button>
          <button type="submit" className="dialog-btn" data-tooltip="Save CLI rotation pool">
            Save Pool
          </button>
        </div>
      )}
    </form>
  );
};
