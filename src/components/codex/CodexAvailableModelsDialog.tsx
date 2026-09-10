import React, { useMemo, useState } from "react";
import type { CodexAccount, CodexModelCatalogCacheEntry } from "../../utils/common/types";
import { copyCodexModelId, formatCodexModelLine } from "../../utils/codex/codex-model-display";

interface CodexAvailableModelsDialogProps {
  isOpen: boolean;
  account: CodexAccount | null;
  entry?: CodexModelCatalogCacheEntry;
  onClose: () => void;
  onRescan: (account: CodexAccount) => void | Promise<void>;
}

export const CodexAvailableModelsDialog: React.FC<CodexAvailableModelsDialogProps> = ({
  isOpen,
  account,
  entry,
  onClose,
  onRescan,
}) => {
  const [filter, setFilter] = useState("");
  const [rescanning, setRescanning] = useState(false);

  const filteredModels = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return (entry?.models ?? []).filter(
      (model) =>
        !query ||
        model.id.toLowerCase().includes(query) ||
        model.displayName.toLowerCase().includes(query),
    );
  }, [entry?.models, filter]);

  if (!isOpen || !account) return null;

  const planName = entry?.planName ?? account.lastPlan ?? "Plan unknown";
  const scanStatus = rescanning
    ? "Scanning…"
    : entry?.error
      ? `Scan failed${entry.fetchedAt ? ` · last successful scan ${new Date(entry.fetchedAt).toLocaleString()}` : ""}`
      : entry?.fetchedAt
        ? `Scanned ${new Date(entry.fetchedAt).toLocaleString()}`
        : "Not scanned yet";

  const handleRescan = async () => {
    if (rescanning) return;
    setRescanning(true);
    try {
      await onRescan(account);
    } finally {
      setRescanning(false);
    }
  };

  return (
    <div
      className="dialog-overlay"
      style={{ display: "flex" }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog-box codex-model-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`Available Codex models for ${account.label}`}
      >
        <div className="dialog-header codex-model-dialog-header">
          <span>Available Models</span>
          <button
            className="codex-model-dialog-close"
            type="button"
            onClick={onClose}
            aria-label="Close available models dialog"
          >
            ×
          </button>
        </div>

        <div className="codex-model-dialog-body">
          <div className="codex-model-dialog-account">
            <div className="codex-model-dialog-identity">
              <strong>{account.label}</strong>
              <span>{account.email ?? "No email"}</span>
            </div>
            <div className="codex-model-dialog-meta">
              <span>{planName}</span>
              <span
                className={
                  entry?.error
                    ? "codex-model-dialog-status codex-model-dialog-status--error"
                    : "codex-model-dialog-status"
                }
              >
                {scanStatus}
              </span>
            </div>
          </div>

          {entry?.error && <div className="codex-model-dialog-error">{entry.error}</div>}

          <div className="codex-model-dialog-tools">
            <input
              className="codex-label-input codex-model-dialog-filter"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter models"
              aria-label="Filter available Codex models"
            />
            <button
              className={`codex-model-dialog-rescan-btn ${rescanning ? "spinning" : ""}`}
              type="button"
              onClick={handleRescan}
              disabled={rescanning}
              data-tooltip="Rescan"
              aria-label="Rescan"
            >
              <svg
                className="codex-model-dialog-rescan-icon"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path d="M20 10L20 9C20 8.07003 20 7.60504 19.8978 7.22354C19.6204 6.18827 18.8117 5.37962 17.7765 5.10222C17.395 5 16.93 5 16 5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M20 14L20 15C20 15.93 20 16.395 19.8978 16.7765C19.6204 17.8117 18.8117 18.6204 17.7765 18.8978C17.395 19 16.93 19 16 19" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 19L9 19C7.13077 19 6.19615 19 5.5 18.5981C5.04394 18.3348 4.66523 17.9561 4.40192 17.5C4 16.8038 4 15.8692 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 5L9 5C7.13077 5 6.19615 5 5.5 5.40192C5.04394 5.66523 4.66523 6.04394 4.40192 6.5C4 7.19615 4 8.13077 4 10" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
                <path d="M10 21L10 3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>

          <div className="codex-model-dialog-list" role="list" aria-label="Available Codex models">
            {filteredModels.length === 0 ? (
              <div className="codex-model-dialog-empty">
                {entry?.models?.length
                  ? "No models match this filter."
                  : entry?.error
                    ? "The previous catalog is unavailable. Rescan to try again."
                    : "No discovered models yet. Rescan this account to load its catalog."}
              </div>
            ) : (
              filteredModels.map((model) => (
                <div className="codex-model-dialog-row" role="listitem" key={model.id}>
                  <span className="codex-model-dialog-model-name">
                    {formatCodexModelLine(model.displayName, model.id)}
                  </span>
                  <button
                    type="button"
                    className="codex-model-copy-btn"
                    aria-label={`Copy ${model.id}`}
                    data-tooltip="Copy model ID"
                    onClick={() => {
                      void copyCodexModelId(model.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="10" height="10" aria-hidden="true">
                      <path d="M8 4v12a2 2 0 002 2h8a2 2 0 002-2V8a2 2 0 00-2-2h-4M8 4a2 2 0 012-2h3m-5 4H5a2 2 0 00-2 2v10a2 2 0 002 2h6a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
