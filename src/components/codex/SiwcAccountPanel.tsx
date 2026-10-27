import React, { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import { CopyLinkSvgIcon } from "../common/CopySvgIcon";
import { CodexAddIcon } from "./CodexIcons";
import type { SiwcAccountView, SiwcSignInStatus } from "../../utils/codex/siwc-types";

interface SiwcAccountPanelProps {
  onAccountsChanged?: (accounts: SiwcAccountView[]) => void;
  onRegistrationDisconnected?: (registrationId: string) => void;
  poolCount?: number;
  enabledPoolCount?: number;
  onNewPool?: () => void;
  children?: React.ReactNode;
}

export const SiwcAccountPanel: React.FC<SiwcAccountPanelProps> = ({
  onAccountsChanged,
  poolCount,
  enabledPoolCount,
  onNewPool,
  children,
}) => {
  const [busy, setBusy] = useState(false);
  const [signInPending, setSignInPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expanded, setExpanded] = useState(true);
  const [accountCount, setAccountCount] = useState(0);

  const reload = useCallback(async () => {
    try {
      const [results, status] = await Promise.all([
        invoke<SiwcAccountView[]>("list_siwc_accounts"),
        invoke<SiwcSignInStatus>("get_siwc_sign_in_status").catch((): SiwcSignInStatus => ({
          pending: false,
        })),
      ]);
      setAccountCount(results.length);
      const isPending = Boolean(status?.pending);
      setSignInPending(isPending);
      if (isPending) {
        setExpanded(true);
      }
      if (!isPending && status?.lastError) {
        setError(status.lastError);
      }
      onAccountsChanged?.(results);
    } catch (cause) {
      setError(`Unable to read ChatGPT registrations: ${String(cause)}`);
    }
  }, [onAccountsChanged]);

  useEffect(() => {
    void reload();
    const interval = setInterval(() => void reload(), 4000);
    return () => clearInterval(interval);
  }, [reload]);

  useEffect(() => {
    if (signInPending) {
      setExpanded(true);
    }
  }, [signInPending]);

  const authorize = async (registrationId?: string) => {
    setBusy(true);
    setError("");
    try {
      const authorizationUrl = await invoke<string>("start_siwc_sign_in", {
        registrationId: registrationId ?? null,
      });
      setSignInPending(true);
      await openUrl(authorizationUrl);
      setNotice("Complete ChatGPT authorization in your browser. Accounts refresh automatically.");
    } catch (cause) {
      setError(`Unable to begin ChatGPT authorization: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const copyLoginLink = async (registrationId?: string) => {
    setBusy(true);
    setError("");
    try {
      const authorizationUrl = await invoke<string>("start_siwc_sign_in", {
        registrationId: registrationId ?? null,
      });
      setSignInPending(true);
      await navigator.clipboard.writeText(authorizationUrl);
      setNotice(
        "✓ Login link copied! Paste and complete ChatGPT authorization in your browser. Accounts refresh automatically.",
      );
    } catch (cause) {
      setError(`Unable to copy ChatGPT authorization link: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  const cancelLogin = async () => {
    setBusy(true);
    setError("");
    try {
      await invoke("cancel_siwc_sign_in");
      setSignInPending(false);
      setNotice("ChatGPT authorization canceled.");
    } catch (cause) {
      setError(`Unable to cancel ChatGPT authorization: ${String(cause)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      className={`qs-siwc-panel${expanded ? "" : " qs-siwc-panel--collapsed"}`}
      aria-label="Sign in with ChatGPT account registrations"
    >
      <div className="qs-siwc-panel-head">
        <button
          type="button"
          className="qs-siwc-summary"
          aria-expanded={expanded}
          aria-controls="qs-siwc-details"
          onClick={() => setExpanded((prev) => !prev)}
          data-tooltip={
            expanded
              ? "Collapse Model routing pools and authorization"
              : "Expand Model routing pools and authorization"
          }
        >
          <span className="qs-siwc-summary-copy">
            <strong>Model routing pools</strong>
            <span>
              Authorize ChatGPT accounts and configure routing model pools
              {poolCount !== undefined
                ? ` · ${enabledPoolCount ?? 0} of ${poolCount} enabled`
                : accountCount > 0
                  ? ` · ${accountCount} authorized`
                  : ""}
            </span>
          </span>
        </button>
        <div className="qs-siwc-head-actions-row">
          {onNewPool && (
            <button
              type="button"
              className="account-action-btn account-action-btn--add codex-pool-new-btn"
              data-tooltip="Create a new model pool"
              onClick={onNewPool}
            >
              <CodexAddIcon />
              <span>New Pool</span>
            </button>
          )}
          <button
            type="button"
            className="account-action-btn account-action-btn--add"
            data-tooltip="Authorize a new ChatGPT plan account for QuotaShift"
            disabled={busy || signInPending}
            onClick={() => void authorize()}
          >
            {busy
              ? "Starting…"
              : signInPending
                ? "Waiting for Browser…"
                : "+ Continue with ChatGPT"}
          </button>
          <button
            type="button"
            className="account-action-btn qs-siwc-copy-btn"
            data-tooltip="Copy the ChatGPT authorization link to clipboard"
            disabled={busy}
            onClick={() => void copyLoginLink()}
          >
            <CopyLinkSvgIcon size={11} />
            <span>Copy Link</span>
          </button>
          {signInPending && (
            <button
              type="button"
              className="account-action-btn qs-model-pool-delete-final"
              data-tooltip="Cancel the current ChatGPT login process"
              disabled={busy}
              onClick={() => void cancelLogin()}
            >
              Cancel Login
            </button>
          )}
          <button
            type="button"
            className="qs-siwc-chevron-btn"
            aria-label={expanded ? "Collapse section" : "Expand section"}
            data-tooltip={expanded ? "Collapse section" : "Expand section"}
            onClick={() => setExpanded((prev) => !prev)}
          >
            <span className="qs-siwc-chevron" aria-hidden="true">
              {expanded ? (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M4.29289 8.29289C4.68342 7.90237 5.31658 7.90237 5.70711 8.29289L12 14.5858L18.2929 8.29289C18.6834 7.90237 19.3166 7.90237 19.7071 8.29289C20.0976 8.68342 20.0976 9.31658 19.7071 9.70711L12.7071 16.7071C12.3166 17.0976 11.6834 17.0976 11.2929 16.7071L4.29289 9.70711C3.90237 9.31658 3.90237 8.68342 4.29289 8.29289Z"
                    fill="currentColor"
                  />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path
                    fillRule="evenodd"
                    clipRule="evenodd"
                    d="M8.29289 4.29289C8.68342 3.90237 9.31658 3.90237 9.70711 4.29289L16.7071 11.2929C17.0976 11.6834 17.0976 12.3166 16.7071 12.7071L9.70711 19.7071C9.31658 20.0976 8.68342 20.0976 8.29289 19.7071C7.90237 19.3166 7.90237 18.6834 8.29289 18.2929L14.5858 12L8.29289 5.70711C7.90237 5.31658 7.90237 4.68342 8.29289 4.29289Z"
                    fill="currentColor"
                  />
                </svg>
              )}
            </span>
          </button>
        </div>
      </div>

      {expanded && (
        <div className="qs-siwc-panel-body" id="qs-siwc-details">
          {notice && (
            <div className="qs-siwc-message" role="status">
              {notice}
            </div>
          )}
          {error && (
            <div className="codex-model-validation codex-model-validation--error" role="alert">
              {error}
            </div>
          )}
          {children}
        </div>
      )}
    </section>
  );
};
