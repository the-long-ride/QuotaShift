import React from "react";
import { AuthorizeRoutingSvgIcon, CopyLinkSvgIcon } from "../../common/icons/CopySvgIcon";
import type { CodexAccount } from "../../../utils/common/types";
import type { SiwcAccountView } from "../../../utils/codex/pools/siwc-types";
import { codexOpenAiSubject } from "../../../utils/codex/pools/codex-siwc-link";

interface CodexCardSiwcActionProps {
  account: CodexAccount;
  registration: SiwcAccountView | null;
  busy: boolean;
  disableActions?: boolean;
  planText?: string;
  onAuthorize: (account: CodexAccount) => void;
  onCopyLink?: (account: CodexAccount) => void;
  onCancel?: (account: CodexAccount) => void;
}

export const CodexCardSiwcAction: React.FC<CodexCardSiwcActionProps> = ({
  account,
  registration,
  busy,
  disableActions = false,
  planText,
  onAuthorize,
  onCopyLink,
  onCancel,
}) => {
  const hasIdentityHint = Boolean(codexOpenAiSubject(account));
  const authorized = registration?.isRoutable === true;
  if (planText === "FREE") {
    return null;
  }
  if (authorized && !busy) {
    return null;
  }
  return (
    <div className="codex-card-siwc-row">
      <div className="codex-card-siwc-status">
        <span className={`codex-card-siwc-dot${authorized ? " codex-card-siwc-dot--ready" : ""}`} />
        <span className="codex-card-siwc-status-text">
          {registration
            ? "Routing: consent required"
            : hasIdentityHint
              ? "Routing: not authorized"
              : "Routing: re-login needed"}
        </span>
      </div>
      {(!authorized || busy) && (
        <div className="codex-card-siwc-actions">
          <button
            type="button"
            className="codex-card-siwc-btn codex-card-siwc-btn--authorize"
            aria-label="Authorize for Model Routing"
            disabled={busy || disableActions}
            data-tooltip={
              busy
                ? "Waiting for Model Routing authorization…"
                : hasIdentityHint
                  ? "Authorize for Model Routing — open separate ChatGPT consent for this Codex account and workspace"
                  : "Authorize for Model Routing — re-authenticate Codex via browser to obtain an identity token first"
            }
            onClick={(event) => {
              event.stopPropagation();
              onAuthorize(account);
            }}
          >
            <AuthorizeRoutingSvgIcon size={10} />
          </button>
          {onCopyLink && (
            <button
              type="button"
              className="codex-card-siwc-btn codex-card-siwc-btn--copy"
              aria-label="Copy Link"
              disabled={disableActions && !busy}
              data-tooltip="Copy Link — copy the Model Routing authorization link for this account"
              onClick={(event) => {
                event.stopPropagation();
                onCopyLink(account);
              }}
            >
              <CopyLinkSvgIcon size={10} />
            </button>
          )}
          {busy && onCancel && (
            <button
              type="button"
              className="codex-card-siwc-btn codex-card-siwc-btn--cancel"
              data-tooltip="Cancel the current Model Routing login process"
              onClick={(event) => {
                event.stopPropagation();
                onCancel(account);
              }}
            >
              Cancel Login
            </button>
          )}
        </div>
      )}
    </div>
  );
};
