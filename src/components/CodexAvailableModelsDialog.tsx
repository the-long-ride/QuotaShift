import React, { useMemo, useState } from "react";
import type { CodexAccount, CodexModelCatalogCacheEntry } from "../utils/types";
import { copyCodexModelId, formatCodexModelLine } from "../utils/codex-model-display";

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
    return (entry?.models ?? []).filter((model) =>
      !query ||
      model.id.toLowerCase().includes(query) ||
      model.displayName.toLowerCase().includes(query)
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
      <div className="dialog-box codex-model-dialog" role="dialog" aria-modal="true" aria-label={`Available Codex models for ${account.label}`}>
        <div className="dialog-header codex-model-dialog-header">
          <span>Available Models</span>
          <button className="codex-model-dialog-close" type="button" onClick={onClose} aria-label="Close available models dialog">×</button>
        </div>

        <div className="codex-model-dialog-body">
          <div className="codex-model-dialog-account">
            <div className="codex-model-dialog-identity">
              <strong>{account.label}</strong>
              <span>{account.email ?? "No email"}</span>
            </div>
            <div className="codex-model-dialog-meta">
              <span>{planName}</span>
              <span className={entry?.error ? "codex-model-dialog-status codex-model-dialog-status--error" : "codex-model-dialog-status"}>
                {scanStatus}
              </span>
            </div>
          </div>

          {entry?.error && (
            <div className="codex-model-dialog-error">{entry.error}</div>
          )}

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
                <path
                  d="M20 7h-5V2M4 17h5v5M19 5a8 8 0 0 0-13.6 2M5 19a8 8 0 0 0 13.6-2"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
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
            ) : filteredModels.map((model) => (
              <div className="codex-model-dialog-row" role="listitem" key={model.id}>
                <span className="codex-model-dialog-model-name">
                  {formatCodexModelLine(model.displayName, model.id)}
                </span>
                <button
                  type="button"
                  className="codex-model-copy-btn"
                  aria-label={`Copy ${model.id}`}
                  data-tooltip="Copy model ID"
                  onClick={() => { void copyCodexModelId(model.id); }}
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
