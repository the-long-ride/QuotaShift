import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccountModalLayout } from "./AccountModalLayout";
import type {
  CodexAccount,
  CodexAccountPool,
  CodexModelCatalogCacheEntry,
  CodexModelSelectionMode,
} from "../utils/types";
import {
  buildCodexTierModelGroups,
  isCodexModelCacheFresh,
  validateCodexPoolModel,
} from "../utils/codex-models";
import { copyCodexModelId, formatCodexModelLine } from "../utils/codex-model-display";

interface CodexPoolModalProps {
  isOpen: boolean;
  accounts: CodexAccount[];
  initialPool: CodexAccountPool | null;
  modelCache?: Record<string, CodexModelCatalogCacheEntry>;
  onRequestModelScan?: (account: CodexAccount) => void;
  onClose: () => void;
  onSave: (pool: CodexAccountPool) => void;
}

const CHECKED_PATH = "m24 24h-24v-24h18.4v2.4h-16v19.2h20v-8.8h2.4v11.2zm-19.52-12.42 1.807-1.807 5.422 5.422 13.68-13.68 1.811 1.803-15.491 15.491z";
const UNCHECKED_PATH = "m24 24h-24v-24h24.8v24zm-1.6-2.4v-19.2h-20v19.2z";

export const CodexPoolModal: React.FC<CodexPoolModalProps> = ({
  isOpen, accounts, initialPool, modelCache = {}, onRequestModelScan, onClose, onSave,
}) => {
  const [name, setName] = useState(""), [model, setModel] = useState("");
  const [modelSelectionMode, setModelSelectionMode] = useState<CodexModelSelectionMode>("manual");
  const [accountIds, setAccountIds] = useState<string[]>([]), [autoSwitch, setAutoSwitch] = useState(false);
  const [isModelListOpen, setIsModelListOpen] = useState(false), [activeOptionIndex, setActiveOptionIndex] = useState(0);
  const requestedScansRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isOpen) return;
    setName(initialPool?.name ?? ""); setModel(initialPool?.model ?? "");
    setModelSelectionMode(initialPool?.modelSelectionMode ?? "manual");
    setAccountIds(initialPool?.accountIds ?? []); setAutoSwitch(initialPool?.autoSwitch ?? false);
    setIsModelListOpen(false); setActiveOptionIndex(0);
  }, [isOpen, initialPool]);

  useEffect(() => { if (!isOpen) requestedScansRef.current.clear(); }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !onRequestModelScan || accountIds.length === 0) return;
    for (const account of accounts) {
      if (!accountIds.includes(account.id) || requestedScansRef.current.has(account.id) || isCodexModelCacheFresh(modelCache[account.id])) continue;
      requestedScansRef.current.add(account.id); onRequestModelScan(account);
    }
  }, [isOpen, accountIds, accounts, modelCache, onRequestModelScan]);

  const tierGroups = useMemo(() => buildCodexTierModelGroups(accounts, modelCache), [accounts, modelCache]);

  const filteredTierGroups = useMemo(() => {
    const query = model.trim().toLowerCase();
    return tierGroups
      .map((g) => ({ ...g, models: g.models.filter(({ model: o }) => !query || o.id.toLowerCase().includes(query) || o.displayName.toLowerCase().includes(query)) }))
      .filter((g) => g.models.length > 0);
  }, [tierGroups, model]);

  const flatOptions = useMemo(
    () => filteredTierGroups.flatMap((g) => g.models.map((e) => ({ tier: g.tier, accountCount: g.accountCount, ...e }))),
    [filteredTierGroups],
  );

  const validation = useMemo(
    () => validateCodexPoolModel(model.trim(), modelSelectionMode, accountIds, accounts, modelCache),
    [model, modelSelectionMode, accountIds, accounts, modelCache],
  );

  const toggleAccount = (id: string) => setAccountIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const selectDiscoveredModel = (id: string) => { setModel(id); setModelSelectionMode("discovered"); setIsModelListOpen(false); setActiveOptionIndex(0); };

  const handleModelKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") { setIsModelListOpen(false); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setIsModelListOpen(true); setActiveOptionIndex((i) => flatOptions.length === 0 ? 0 : Math.min(i + 1, flatOptions.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setIsModelListOpen(true); setActiveOptionIndex((i) => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && isModelListOpen && flatOptions[activeOptionIndex]) { e.preventDefault(); selectDiscoveredModel(flatOptions[activeOptionIndex].model.id); }
  };

  const handleSave = () => {
    const trimmedName = name.trim(), trimmedModel = model.trim();
    if (!trimmedName || !trimmedModel || !validation.canSave) return;
    onSave({
      id: initialPool?.id ?? `codex-pool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: trimmedName, model: trimmedModel, accountIds: [...new Set(accountIds)], autoSwitch, modelSelectionMode,
      ...(initialPool?.activatedAt ? { activatedAt: initialPool.activatedAt } : {}),
    });
  };

  return (
    <AccountModalLayout
      isOpen={isOpen}
      onClose={onClose}
      title={initialPool ? "Edit Model Pool" : "New Model Pool"}
      icon={<span style={{ fontSize: "14px" }}>◫</span>}
      bodyClassName="codex-pool-modal-body-scroll"
      footerButtons={
        <>
          <button className="dialog-btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="dialog-btn dialog-btn--primary"
            onClick={handleSave}
            disabled={!name.trim() || !model.trim() || !validation.canSave}
          >
            {initialPool ? "Save" : "Create Pool"}
          </button>
        </>
      }
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: "5px", fontSize: "10px" }}>
          Pool name
          <input
            className="codex-label-input"
            style={{ width: "100%", maxWidth: "none" }}
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="My model pool"
            autoFocus
          />
        </label>

        <div className="codex-model-combobox-field">
          <label htmlFor="codex-pool-model" style={{ fontSize: "10px" }}>
            Model
          </label>
          <div className="codex-model-combobox">
            <input
              id="codex-pool-model"
              className="codex-label-input"
              style={{ width: "100%", maxWidth: "none" }}
              value={model}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isModelListOpen}
              aria-controls="codex-pool-model-listbox"
              onFocus={() => setIsModelListOpen(true)}
              onChange={(event) => {
                setModel(event.target.value);
                setModelSelectionMode("manual");
                setIsModelListOpen(true);
                setActiveOptionIndex(0);
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
                    <div className="codex-model-option-heading">
                      <span>{group.tier}</span>
                      <span>
                        {group.scannedCount}/{group.accountCount} scanned
                      </span>
                    </div>
                    {group.models.map((entry) => {
                      const optionIndex = flatOptions.findIndex(
                        (candidate) =>
                          candidate.tier === group.tier && candidate.model.id === entry.model.id,
                      );
                      return (
                        <div
                          className="codex-model-option-row"
                          key={`${group.tier}:${entry.model.id}`}
                        >
                          <button
                            type="button"
                            role="option"
                            aria-selected={
                              modelSelectionMode === "discovered" && model === entry.model.id
                            }
                            className={
                              "codex-model-option" +
                              (optionIndex === activeOptionIndex
                                ? " codex-model-option--active"
                                : "")
                            }
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => selectDiscoveredModel(entry.model.id)}
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
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={(event) => {
                              event.stopPropagation();
                              void copyCodexModelId(entry.model.id);
                            }}
                          >
                            Copy
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
            {modelSelectionMode === "discovered"
              ? "Discovered model: selected members must confirm support."
              : "Manual model: compatibility is advisory and Save remains available."}
          </span>
          {validation.warning && validation.reasons && (
            <div className="codex-model-validation codex-model-validation--warning">
              {Object.values(validation.reasons)[0] ??
                "Some members have not confirmed this model."}
            </div>
          )}
          {!validation.canSave && (
            <div className="codex-model-validation codex-model-validation--error">
              {Object.values(validation.reasons)[0] ??
                "Selected members do not all support this discovered model."}
            </div>
          )}
        </div>

        <div>
          <div style={{ fontSize: "10px", marginBottom: "6px" }}>Members</div>
          {accounts.length === 0 ? (
            <div style={{ fontSize: "9px", color: "var(--text-secondary)" }}>
              No saved Codex accounts yet.
            </div>
          ) : (
            <div className="codex-pool-member-list">
              {accounts.map((account) => {
                const selected = accountIds.includes(account.id);
                const accountValidation = validateCodexPoolModel(
                  model.trim(),
                  modelSelectionMode,
                  [account.id],
                  accounts,
                  modelCache,
                );
                const incompatibility = accountValidation.incompatibleAccountIds.includes(
                  account.id,
                );
                const compatibility = !model.trim()
                  ? "Choose model"
                  : incompatibility
                    ? (accountValidation.reasons[account.id] ?? "Not supported")
                    : modelSelectionMode === "discovered"
                      ? "Supported"
                      : "Manual";
                const plan = account.lastPlan ?? modelCache[account.id]?.planName ?? "Plan unknown";
                return (
                  <div key={account.id} className="codex-pool-member-row">
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={selected}
                      aria-label={`${selected ? "Remove" : "Add"} ${account.label}`}
                      className={
                        "codex-pool-member-checkbox" +
                        (selected ? " codex-pool-member-checkbox--checked" : "")
                      }
                      onClick={() => toggleAccount(account.id)}
                    >
                      <svg viewBox="0 0 27 24" aria-hidden="true">
                        <path d={selected ? CHECKED_PATH : UNCHECKED_PATH} />
                      </svg>
                    </button>
                    <div className="codex-pool-member-identity">
                      <span className="codex-pool-member-label">{account.label}</span>
                      <span className="codex-pool-member-email">{account.email ?? "No email"}</span>
                    </div>
                    <span className="codex-pool-member-plan">{plan}</span>
                    <span
                      className={
                        "codex-pool-member-compatibility" +
                        (incompatibility ? " codex-pool-member-compatibility--error" : "")
                      }
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
            className={"codex-pool-switch" + (autoSwitch ? " codex-pool-switch--on" : "")}
            onClick={() => setAutoSwitch((value) => !value)}
          >
            <span className="codex-pool-switch-thumb" aria-hidden="true" />
          </button>
          <span>
            Auto-switch when the active member is exhausted or unusable and another pool member has
            strictly better capacity.
          </span>
        </label>
      </div>
    </AccountModalLayout>
  );
};
