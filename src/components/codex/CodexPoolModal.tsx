import React, { useEffect, useMemo, useRef } from "react";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { CopySvgIcon } from "../common/CopySvgIcon";
import {
  buildCodexTierModelGroups,
  isCodexModelCacheFresh,
  validateCodexPoolModel,
} from "../../utils/codex/codex-models";
import { copyCodexModelId, formatCodexModelLine } from "../../utils/codex/codex-model-display";
import { useCodexPoolModelFilter } from "./useCodexPoolModelFilter";
import { useCodexPoolEditorState } from "./useCodexPoolEditorState";
import {
  AUTO_SWITCH_DESC,
  buildCodexPoolPayload,
  getModelSelectionHint,
  getPoolMemberDetails,
  type CodexPoolModalProps,
} from "./codex-pool-helpers";
import { CodexPoolMemberIdentity } from "./CodexPoolMemberIdentity";
import { CodexModelOptionHeading } from "./CodexModelOptionHeading";
import { CodexPoolModalFooter } from "./CodexPoolModalFooter";

const CHECKED_PATH =
  "m24 24h-24v-24h18.4v2.4h-16v19.2h20v-8.8h2.4v11.2zm-19.52-12.42 1.807-1.807 5.422 5.422 13.68-13.68 1.811 1.803-15.491 15.491z";
const UNCHECKED_PATH = "m24 24h-24v-24h24.8v24zm-1.6-2.4v-19.2h-20v19.2z";

export const CodexPoolModal: React.FC<CodexPoolModalProps> = ({
  isOpen,
  accounts,
  initialPool,
  modelCache = {},
  onRequestModelScan,
  onClose,
  onSave,
}) => {
  const requestedScansRef = useRef<Set<string>>(new Set());
  const state = useCodexPoolEditorState({
    isOpen,
    initialPool,
    onClose,
    flatOptionsLength: 0,
    onSelectOption: (idx) => {
      if (flatOptions[idx]) selectDiscoveredModel(flatOptions[idx].model.id);
    },
  });

  const {
    name,
    setName,
    model,
    setModel,
    modelSelectionMode,
    setModelSelectionMode,
    accountIds,
    setAccountIds,
    autoSwitch,
    setAutoSwitch,
    isModelListOpen,
    setIsModelListOpen,
    activeOptionIndex,
    toggleAccount,
    selectDiscoveredModel,
    handleModelKeyDown,
  } = state;

  const tierGroups = useMemo(
    () => buildCodexTierModelGroups(accounts, modelCache),
    [accounts, modelCache],
  );
  const { filteredTierGroups, flatOptions } = useCodexPoolModelFilter(tierGroups, model);

  useEffect(() => {
    if (!isOpen) {
      requestedScansRef.current.clear();
      return;
    }
    if (!onRequestModelScan || accountIds.length === 0) return;
    for (const account of accounts) {
      if (
        !accountIds.includes(account.id) ||
        requestedScansRef.current.has(account.id) ||
        isCodexModelCacheFresh(modelCache[account.id])
      )
        continue;
      requestedScansRef.current.add(account.id);
      onRequestModelScan(account);
    }
  }, [isOpen, accountIds, accounts, modelCache, onRequestModelScan]);

  const validation = useMemo(
    () =>
      validateCodexPoolModel(model.trim(), modelSelectionMode, accountIds, accounts, modelCache),
    [model, modelSelectionMode, accountIds, accounts, modelCache],
  );

  const handleSave = () => {
    if (!name.trim() || !model.trim() || !validation.canSave) return;
    onSave(buildCodexPoolPayload(initialPool, name, model, state));
    onClose();
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={initialPool ? "Edit Model Pool" : "New Model Pool"}
      icon={<span style={{ fontSize: "14px" }}>◫</span>}
      bodyClassName="codex-pool-modal-body-scroll"
      footerButtons={
        <CodexPoolModalFooter
          initialPool={initialPool}
          disabled={!name.trim() || !model.trim() || !validation.canSave}
          onClose={onClose}
          onSave={handleSave}
        />
      }
    >
      <div className="codex-pool-modal-form">
        <label className="codex-pool-name-label">
          Pool name
          <input
            className="codex-label-input codex-label-input--full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My model pool"
            autoFocus
          />
        </label>

        <div className="codex-model-combobox-field">
          <label htmlFor="codex-pool-model" className="codex-field-label">
            Model
          </label>
          <div className="codex-model-combobox">
            <input
              id="codex-pool-model"
              className="codex-label-input codex-label-input--full"
              value={model}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isModelListOpen}
              aria-controls="codex-pool-model-listbox"
              onFocus={() => setIsModelListOpen(true)}
              onChange={(e) => {
                setModel(e.target.value);
                setModelSelectionMode("manual");
                setIsModelListOpen(true);
              }}
              onKeyDown={handleModelKeyDown}
              placeholder="Type a model ID or choose a discovered model"
            />
            {isModelListOpen && filteredTierGroups.length > 0 && (
              <div id="codex-pool-model-listbox" role="listbox" className="codex-model-listbox">
                {filteredTierGroups.map((group) => (
                  <div
                    key={group.tier}
                    role="group"
                    aria-label={group.tier}
                    className="codex-model-option-group"
                  >
                    <CodexModelOptionHeading group={group} />
                    {group.models.map((entry: any) => {
                      const optionIndex = flatOptions.findIndex(
                        (c) => c.tier === group.tier && c.model.id === entry.model.id,
                      );
                      const isSelected =
                        modelSelectionMode === "discovered" && model === entry.model.id;
                      return (
                        <div
                          className="codex-model-option-row"
                          key={`${group.tier}:${entry.model.id}`}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            data-tooltip={`Select model ${entry.model.id}`}
                            className={`codex-model-option${optionIndex === activeOptionIndex ? " codex-model-option--active" : ""}`}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              selectDiscoveredModel(entry.model.id);
                              setModelSelectionMode("discovered");
                            }}
                          >
                            <span className="codex-model-option-name">
                              {formatCodexModelLine(entry.model.displayName, entry.model.id)}
                            </span>
                            <span className="codex-model-option-meta">
                              {entry.supportCount}/{group.accountCount} accounts
                            </span>
                          </button>
                          <button
                            type="button"
                            className="codex-model-copy-btn codex-model-option-copy-btn"
                            aria-label={`Copy ${entry.model.id}`}
                            data-tooltip="Copy model ID"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              void copyCodexModelId(entry.model.id);
                            }}
                          >
                            <CopySvgIcon size={10} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
          <span className="codex-model-selection-hint">
            {getModelSelectionHint(modelSelectionMode)}
          </span>
          {validation.warning && validation.reasons && (
            <div className="codex-model-validation codex-model-validation--warning">
              {Object.values(validation.reasons)[0] ??
                "Some members have not confirmed this model."}
            </div>
          )}
          {!validation.canSave && (
            <div className="codex-model-validation codex-model-validation--error">
              {validation.reasons ? Object.values(validation.reasons)[0] : null}
            </div>
          )}
        </div>

        <div>
          <div className="codex-pool-members-header">
            <div className="codex-field-label">Members</div>
            {accounts.length > 0 && (
              <div className="codex-pool-members-actions">
                <button
                  type="button"
                  className="codex-pool-members-action-btn"
                  onClick={() => setAccountIds(accounts.map((a) => a.id))}
                  data-tooltip="Select all member accounts"
                >
                  Select all
                </button>
                <span className="codex-pool-members-divider">/</span>
                <button
                  type="button"
                  className="codex-pool-members-action-btn"
                  onClick={() => setAccountIds([])}
                  data-tooltip="Unselect all member accounts"
                >
                  Unselect all
                </button>
              </div>
            )}
          </div>
          {accounts.length === 0 ? (
            <div className="codex-pool-members-empty">No saved Codex accounts yet.</div>
          ) : (
            <div className="codex-pool-member-list">
              {accounts.map((account) => {
                const selected = accountIds.includes(account.id);
                const { incompatibility, compatibility } = getPoolMemberDetails(
                  account,
                  model,
                  modelSelectionMode,
                  accounts,
                  modelCache,
                );
                const plan = account.lastPlan ?? modelCache[account.id]?.planName ?? "Plan unknown";
                return (
                  <div key={account.id} className="codex-pool-member-row">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${account.label}`}
                      data-tooltip={`${selected ? "Remove" : "Add"} ${account.label}`}
                      className={`codex-pool-member-checkbox${selected ? " codex-pool-member-checkbox--checked" : ""}`}
                      onClick={() => toggleAccount(account.id)}
                    >
                      <svg viewBox="0 0 27 24" aria-hidden="true">
                        <path d={selected ? CHECKED_PATH : UNCHECKED_PATH} />
                      </svg>
                    </button>
                    <CodexPoolMemberIdentity label={account.label} email={account.email} />
                    <span className="codex-pool-member-plan">{plan}</span>
                    <span
                      className={`codex-pool-member-compatibility${incompatibility ? " codex-pool-member-compatibility--error" : ""}`}
                    >
                      {compatibility}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <label className="codex-pool-switch-row">
          <button
            type="button"
            role="switch"
            aria-checked={autoSwitch}
            aria-label="Automatically switch to another usable pool member"
            data-tooltip="Automatically switch to another usable pool member"
            className={`codex-pool-switch${autoSwitch ? " codex-pool-switch--on" : ""}`}
            onClick={() => setAutoSwitch((v) => !v)}
          >
            <span className="codex-pool-switch-thumb" aria-hidden="true" />
          </button>
          <span>{AUTO_SWITCH_DESC}</span>
        </label>
      </div>
    </AccountModalLayout>
  );
};
