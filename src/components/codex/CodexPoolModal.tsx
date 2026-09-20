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
  buildCodexPoolPayload,
  getModelSelectionHint,
  getPoolMemberDetails,
  type CodexPoolModalProps,
} from "./codex-pool-helpers";
import { CodexPoolMemberCheckbox, CodexPoolMemberIdentity } from "./CodexPoolMemberIdentity";
import { CodexModelOptionHeading } from "./CodexModelOptionHeading";
import {
  CodexPoolFieldError,
  CodexPoolModalFooter,
  CodexPoolModelValidationMessage,
} from "./CodexPoolModalFooter";

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
    isModelListOpen,
    setIsModelListOpen,
    activeOptionIndex,
    toggleAccount,
    selectDiscoveredModel,
    handleModelKeyDown,
    requiredErrors,
    hasRequiredErrors,
    showRequiredErrors,
    setShowRequiredErrors,
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
    setShowRequiredErrors(true);
    if (hasRequiredErrors || !validation.canSave) return;
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
        <CodexPoolModalFooter initialPool={initialPool} onClose={onClose} onSave={handleSave} />
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
            aria-invalid={showRequiredErrors && Boolean(requiredErrors.name)}
            aria-describedby={
              showRequiredErrors && requiredErrors.name ? "codex-pool-name-error" : undefined
            }
            autoFocus
          />
          <CodexPoolFieldError
            id="codex-pool-name-error"
            message={showRequiredErrors ? requiredErrors.name : undefined}
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
              aria-invalid={showRequiredErrors && Boolean(requiredErrors.model)}
              aria-describedby={
                showRequiredErrors && requiredErrors.model ? "codex-pool-model-error" : undefined
              }
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
          <CodexPoolFieldError
            id="codex-pool-model-error"
            message={showRequiredErrors ? requiredErrors.model : undefined}
          />
          <span className="codex-model-selection-hint">
            {getModelSelectionHint(modelSelectionMode)}
          </span>
          <CodexPoolModelValidationMessage validation={validation} />
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
            <div
              className="codex-pool-member-list"
              aria-invalid={showRequiredErrors && Boolean(requiredErrors.members)}
            >
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
                    <CodexPoolMemberCheckbox
                      selected={selected}
                      label={account.label}
                      onToggle={() => toggleAccount(account.id)}
                    />
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
          <div className="codex-pool-members-error">
            <CodexPoolFieldError
              message={showRequiredErrors ? requiredErrors.members : undefined}
            />
          </div>
        </div>
      </div>
    </AccountModalLayout>
  );
};
