import React from "react";

export interface ResetCreditEntry {
  key: string;
  title: string;
  badge: string;
  available: boolean;
  expiresAt: string | null;
  expiry: string;
  grantedAt?: string | null;
  granted?: string;
}

interface ResetCreditsDialogProps {
  accountName: string;
  accountDetail: string;
  plan: string;
  count: number;
  credits: ResetCreditEntry[];
  emptyMessage: string;
  onClose: () => void;
}

export const ResetCreditsDialog: React.FC<ResetCreditsDialogProps> = ({
  accountName,
  accountDetail,
  plan,
  count,
  credits,
  emptyMessage,
  onClose,
}) => (
  <div
    className="dialog-overlay"
    style={{ display: "flex" }}
    onClick={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <div
      className="dialog-box codex-model-dialog codex-reset-dialog"
      role="dialog"
      aria-modal="true"
      aria-label={`Reset credits for ${accountName}`}
      style={{ width: "320px", maxWidth: "90vw" }}
    >
      <div className="dialog-header codex-model-dialog-header">
        <div className="reset-credits-title">
          <span>Rate Limit Reset Credits</span>
          <span
            className={`reset-credits-count${count > 0 ? " reset-credits-count--available" : ""}`}
          >
            {count} Available
          </span>
        </div>
        <button
          className="codex-model-dialog-close"
          type="button"
          onClick={onClose}
          data-tooltip="Close dialog"
          aria-label="Close dialog"
        >
          ×
        </button>
      </div>

      <div className="codex-model-dialog-body reset-credits-body">
        <div className="codex-model-dialog-account reset-credits-account">
          <div className="codex-model-dialog-identity">
            <strong>{accountName}</strong>
            <span>{accountDetail}</span>
          </div>
          <span className="reset-credits-plan">{plan}</span>
        </div>

        {credits.length > 0 ? (
          <div className="reset-credits-list">
            {credits.map((credit) => (
              <article className="reset-credit" key={credit.key}>
                <div className="reset-credit-heading">
                  <strong>{credit.title}</strong>
                  <span
                    className={`reset-credit-badge${credit.available ? " reset-credit-badge--available" : ""}`}
                  >
                    {credit.badge}
                  </span>
                </div>
                <div className="reset-credit-row">
                  <span>Expiry:</span>
                  <time dateTime={credit.expiresAt ?? undefined}>{credit.expiry}</time>
                </div>
                {credit.granted && (
                  <div className="reset-credit-row">
                    <span>Granted:</span>
                    <time dateTime={credit.grantedAt ?? undefined}>{credit.granted}</time>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <p className="reset-credits-empty">{emptyMessage}</p>
        )}
      </div>
    </div>
  </div>
);
