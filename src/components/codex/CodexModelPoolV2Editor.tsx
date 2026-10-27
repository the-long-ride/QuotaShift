import React, { useEffect, useMemo, useRef, useState } from "react";
import type { CodexAccount, CodexModelCatalogCacheEntry } from "../../utils/common/types";
import type { CodexModelPoolV2 } from "../../utils/codex/codex-pools-v2-types";
import { isCodexModelCacheFresh, validateCodexPoolModel } from "../../utils/codex/codex-models";
import { AccountModalLayout } from "../common/AccountModalLayout";
import { CodexModelPoolV2Policies } from "./CodexModelPoolV2Policies";
import { CommonSwitch } from "../common/CommonSwitch";
import { CodexModelPoolV2Members } from "./CodexModelPoolV2Members";
import { CodexModelPoolV2ModelField } from "./CodexModelPoolV2ModelField";
import { useSiwcPoolModels } from "./useSiwcPoolModels";
import type { SiwcAccountView } from "../../utils/codex/siwc-types";
import { CodexModelPoolV2NameFields } from "./CodexModelPoolV2NameFields";
import { CodexModelPoolV2LimitsFields } from "./CodexModelPoolV2LimitsFields";
import { getDefaultModelLimits } from "../../utils/codex/codex-pools-v2";
// Scanned upstream models are resolved via buildCodexTierModelGroups in buildScannedModels
import { buildScannedModels, freshPool } from "./codex-pool-helpers";

export interface CodexModelPoolV2EditorProps {
  pool: CodexModelPoolV2 | null;
  accounts: CodexAccount[];
  siwcAccounts?: SiwcAccountView[];
  modelCache: Record<string, CodexModelCatalogCacheEntry>;
  onRequestModelScan?: (account: CodexAccount) => void | Promise<void>;
  onSave: (pool: CodexModelPoolV2) => boolean;
  onClose: () => void;
}

const MANUAL_MODEL = "__qs_manual_model_entry__";

export const CodexModelPoolV2Editor: React.FC<CodexModelPoolV2EditorProps> = ({
  pool,
  accounts,
  siwcAccounts = [],
  modelCache,
  onRequestModelScan,
  onSave,
  onClose,
}) => {
  const [draft, setDraft] = useState<CodexModelPoolV2>(
    () => pool ?? freshPool(siwcAccounts, accounts),
  );
  const [error, setError] = useState("");
  const requestedScansRef = useRef<Set<string>>(new Set());
  const update = <K extends keyof CodexModelPoolV2>(key: K, value: CodexModelPoolV2[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    setDraft(pool ?? freshPool(siwcAccounts, accounts));
    setError("");
  }, [pool]);

  useEffect(() => {
    if (!onRequestModelScan || draft.authMode === "siwc") return;
    for (const account of accounts) {
      if (
        !draft.memberAccountIds.includes(account.id) ||
        requestedScansRef.current.has(account.id) ||
        isCodexModelCacheFresh(modelCache[account.id])
      )
        continue;
      requestedScansRef.current.add(account.id);
      void onRequestModelScan(account);
    }
  }, [accounts, draft.memberAccountIds, modelCache, onRequestModelScan]);

  const selectedAccounts = useMemo(
    () => accounts.filter((account) => draft.memberAccountIds.includes(account.id)),
    [accounts, draft.memberAccountIds],
  );
  const scannedModels = useMemo(
    () => buildScannedModels(selectedAccounts, modelCache),
    [selectedAccounts, modelCache],
  );
  const validation = useMemo(
    () =>
      validateCodexPoolModel(
        draft.upstreamModelId,
        draft.modelSelectionMode,
        draft.memberAccountIds,
        accounts,
        modelCache,
      ),
    [draft.upstreamModelId, draft.modelSelectionMode, draft.memberAccountIds, accounts, modelCache],
  );
  const isSiwc = draft.authMode === "siwc";
  const {
    models: siwcCatalog,
    loading: siwcLoading,
    hasError: siwcCatalogError,
  } = useSiwcPoolModels(draft.memberAccountIds, isSiwc, siwcAccounts);
  const readySiwcMembers =
    draft.memberAccountIds.length > 0 &&
    draft.memberAccountIds.every((id) =>
      siwcAccounts.some((account) => account.id === id && account.isRoutable),
    );
  const compatibleAccounts = isSiwc
    ? siwcAccounts
        .filter((account) => account.isRoutable)
        .map((account) => {
          const linked = accounts.find((a) => a.id === account.linkedCodexAccountId);
          const label = account.email || linked?.email || linked?.label || account.id;
          return {
            id: account.id,
            label,
            email: account.email || linked?.email,
            lastPlan: linked?.lastPlan || "SIWC",
          };
        })
    : accounts;
  const modelOptions = isSiwc
    ? siwcCatalog.map((model) => ({
        id: model.slug,
        label: model.displayName,
        tier: "SIWC",
        supportCount: draft.memberAccountIds.length,
      }))
    : scannedModels;
  const modelValid = isSiwc
    ? draft.modelSelectionMode !== "discovered" ||
      siwcCatalog.some((model) => model.slug === draft.upstreamModelId)
    : validation.canSave;

  const selectedModel =
    draft.modelSelectionMode === "discovered" ? draft.upstreamModelId : MANUAL_MODEL;

  const save = () => {
    if (
      !draft.displayName.trim() ||
      !draft.publicModelName.trim() ||
      !draft.upstreamModelId.trim()
    ) {
      setError("Enter a name, public routing alias, and upstream model ID.");
      return;
    }
    if (!draft.memberAccountIds.length) {
      setError("Choose at least one member account.");
      return;
    }
    if (isSiwc && draft.enabled && !readySiwcMembers) {
      setError(
        "Select SIWC registrations authorized for ChatGPT plan usage. Legacy Codex OAuth is not eligible.",
      );
      return;
    }
    if (!modelValid) {
      setError(
        "The discovered upstream model must appear in fresh scans for every selected member. Rescan accounts, change members, or enter a manual model ID.",
      );
      return;
    }
    const cleaned = {
      ...draft,
      displayName: draft.displayName.trim(),
      publicModelName: draft.publicModelName.trim(),
      upstreamModelId: draft.upstreamModelId.trim(),
    };
    if (onSave(cleaned)) onClose();
    else setError("Could not save. Check enabled aliases and account memberships.");
  };

  return (
    <AccountModalLayout
      isOpen
      onClose={onClose}
      title={pool ? "Edit Model Pool" : "New Model Pool"}
      icon={
        <span className="qs-model-pool-editor-icon" aria-hidden="true">
          ◫
        </span>
      }
      dialogClassName="qs-model-pool-editor"
      bodyClassName="codex-pool-modal-body-scroll"
      footerButtons={
        <>
          <button
            type="button"
            className="dialog-btn dialog-btn--secondary"
            onClick={onClose}
            data-tooltip="Cancel model pool changes"
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-btn dialog-btn--primary"
            onClick={save}
            data-tooltip={pool ? "Save model pool changes" : "Create model pool"}
          >
            {pool ? "Save" : "Create Pool"}
          </button>
        </>
      }
    >
      <div className="codex-pool-modal-form qs-model-pool-form">
        <CodexModelPoolV2NameFields
          displayName={draft.displayName}
          publicModelName={draft.publicModelName}
          onDisplayNameChange={(value) => update("displayName", value)}
          onPublicModelNameChange={(value) => update("publicModelName", value)}
        />
        <CodexModelPoolV2ModelField
          selectedModel={selectedModel}
          modelSelectionMode={draft.modelSelectionMode}
          upstreamModelId={draft.upstreamModelId}
          scannedModels={modelOptions}
          valid={modelValid}
          isSiwc={isSiwc}
          onSelect={(value) => {
            if (value === MANUAL_MODEL) update("modelSelectionMode", "manual");
            else
              setDraft((previous) => ({
                ...previous,
                upstreamModelId: value,
                modelSelectionMode: "discovered",
                maxContextWindowTokens: getDefaultModelLimits(value).maxContextWindowTokens,
              }));
            setError("");
          }}
          onManualChange={(value) =>
            setDraft((previous) => ({
              ...previous,
              upstreamModelId: value,
              maxContextWindowTokens:
                pool?.maxContextWindowTokens ?? getDefaultModelLimits(value).maxContextWindowTokens,
            }))
          }
        />
        <CodexModelPoolV2LimitsFields
          maxContextWindowTokens={
            draft.maxContextWindowTokens ??
            getDefaultModelLimits(draft.upstreamModelId).maxContextWindowTokens
          }
          thinkingBudgetTokens={draft.thinkingBudgetTokens ?? 8_192}
          reasoningEffort={draft.reasoningEffort ?? "medium"}
          onChangeLimits={(next) =>
            setDraft((previous) => ({
              ...previous,
              ...next,
            }))
          }
        />
        {isSiwc && (siwcLoading || siwcCatalogError) && (
          <span className="codex-model-selection-hint">
            {siwcLoading
              ? "Loading authorized SIWC models…"
              : "SIWC catalog unavailable; reconnect the affected account."}
          </span>
        )}
        <CodexModelPoolV2Policies
          authMode={draft.authMode}
          routingPolicy={draft.routingPolicy}
          onAuthChange={(value) => {
            setDraft((previous) => ({
              ...previous,
              authMode: value,
              enabled: false,
              memberAccountIds: [],
              modelSelectionMode: "manual",
              upstreamModelId: "",
            }));
            setError("");
          }}
          onPolicyChange={(value) => update("routingPolicy", value)}
        />
        <span className="codex-model-selection-hint">
          {isSiwc
            ? "Select registered ChatGPT plan accounts below. Native OAuth tokens never enter the renderer or Codex account files."
            : "API key routing is separately billed. Select API-key accounts, not existing Codex OAuth sessions."}
        </span>
        <CodexModelPoolV2Members
          accounts={compatibleAccounts}
          memberAccountIds={draft.memberAccountIds}
          onChange={(ids) =>
            update(
              "memberAccountIds",
              ids.filter((id) => compatibleAccounts.some((acc) => acc.id === id)),
            )
          }
        />
        <div className="qs-model-pool-enabled-row">
          <div>
            <div className="qs-model-pool-enabled-title">Enable routing</div>
            <div className="codex-model-selection-hint">
              Expose this pool by its public model name
            </div>
          </div>
          <CommonSwitch
            checked={draft.enabled}
            onToggle={() => {
              if (isSiwc && !draft.enabled && !readySiwcMembers) {
                setError(
                  "Select a native SIWC account with ChatGPT plan permission before enabling.",
                );
              } else {
                update("enabled", !draft.enabled);
                setError("");
              }
            }}
            tooltip={
              isSiwc && !readySiwcMembers
                ? "Choose authorized SIWC registrations first"
                : draft.enabled
                  ? "Disable model pool"
                  : "Enable model pool"
            }
            ariaLabel="Enable this model pool"
          />
        </div>
        {error && (
          <div role="alert" className="codex-model-validation codex-model-validation--error">
            {error}
          </div>
        )}
      </div>
    </AccountModalLayout>
  );
};
