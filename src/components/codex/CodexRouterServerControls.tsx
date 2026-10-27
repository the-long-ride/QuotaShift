import React from "react";
import { CopySvgIcon } from "../common/CopySvgIcon";
import { CliCheckIcon } from "../common/CliPoolIcons";
import { EyeIcon, EyeOffIcon, KeyRegenerateIcon } from "./CodexRouterServerIcons";

const KEY_MASK = "•".repeat(20);

export interface CodexRouterServerControlsProps {
  baseUrl: string;
  portInput: string;
  parsedPort: number | null | "invalid";
  portUnchanged: boolean;
  revealedKey: string | null;
  busy: "restart" | "port" | "rotate" | null;
  confirmRotate: boolean;
  copied: string | null;
  onSetPortInput: (val: string) => void;
  onApplyPort: () => void;
  onToggleReveal: () => void;
  onCopy: (label: string, text: string | Promise<string>) => void;
  onStartRotateConfirm: () => void;
  onCancelRotateConfirm: () => void;
  onConfirmRotate: () => void;
  fetchKey: () => Promise<string>;
}

export const CodexRouterServerControls: React.FC<CodexRouterServerControlsProps> = ({
  baseUrl,
  portInput,
  parsedPort,
  portUnchanged,
  revealedKey,
  busy,
  confirmRotate,
  copied,
  onSetPortInput,
  onApplyPort,
  onToggleReveal,
  onCopy,
  onStartRotateConfirm,
  onCancelRotateConfirm,
  onConfirmRotate,
  fetchKey,
}) => {
  const copyLabel = (label: string, idle: string) => (copied === label ? "Copied" : idle);

  return (
    <div className="qs-router-server-row-group">
      <div className="qs-router-server-field qs-router-server-field--url">
        <span className="qs-router-server-label">Base URL</span>
        <div className="qs-router-server-row">
          <div className="qs-router-input-wrap qs-router-input-wrap--url">
            <code className="qs-router-server-value qs-router-server-value--floating">
              {baseUrl || "-"}
            </code>
            <button
              type="button"
              className="qs-router-floating-btn"
              data-tooltip={copied === "url" ? "Copied!" : "Copy base URL"}
              aria-label="Copy base URL"
              disabled={!baseUrl}
              onClick={() => void onCopy("url", baseUrl)}
            >
              {copied === "url" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
            </button>
          </div>
          <button
            type="button"
            className="qs-router-server-btn qs-router-server-btn--with-icon"
            data-tooltip="Copy OPENAI_BASE_URL and OPENAI_API_KEY for any OpenAI-compatible client"
            disabled={!baseUrl}
            onClick={() =>
              void onCopy(
                "env",
                fetchKey().then((key) => `OPENAI_BASE_URL=${baseUrl}/v1\nOPENAI_API_KEY=${key}`),
              )
            }
          >
            {copied === "env" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
            <span>{copyLabel("env", "Env vars")}</span>
          </button>
          <button
            type="button"
            className="qs-router-server-btn qs-router-server-btn--with-icon"
            data-tooltip="Copy a curl health check (no key needed)"
            disabled={!baseUrl}
            onClick={() => void onCopy("curl", `curl ${baseUrl}/health`)}
          >
            {copied === "curl" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
            <span>{copyLabel("curl", "curl")}</span>
          </button>
        </div>
      </div>

      <div className="qs-router-server-field qs-router-server-field--port">
        <span className="qs-router-server-label">Port</span>
        <div className="qs-router-server-row">
          <input
            className="qs-router-server-input"
            inputMode="numeric"
            placeholder="Random"
            aria-label="Router port"
            aria-invalid={parsedPort === "invalid"}
            value={portInput}
            onChange={(event) => onSetPortInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && busy === null) onApplyPort();
            }}
          />
          <button
            type="button"
            className="qs-router-server-btn"
            data-tooltip="Save this port and restart on it. Empty uses a random free port."
            disabled={busy !== null || parsedPort === "invalid" || portUnchanged}
            onClick={onApplyPort}
          >
            {busy === "port" ? "Applying…" : "Apply"}
          </button>
        </div>
      </div>

      <div className="qs-router-server-field qs-router-server-field--key">
        <span className="qs-router-server-label">Key</span>
        <div className="qs-router-server-row">
          <div className="qs-router-input-wrap">
            <code className="qs-router-server-value qs-router-server-key qs-router-server-value--floating-multi">
              {revealedKey ?? KEY_MASK}
            </code>
            <div className="qs-router-floating-actions">
              <button
                type="button"
                className="qs-router-floating-btn"
                data-tooltip={revealedKey ? "Hide key" : "Show key"}
                aria-label={revealedKey ? "Hide key" : "Show key"}
                onClick={onToggleReveal}
              >
                {revealedKey ? <EyeOffIcon size={11} /> : <EyeIcon size={11} />}
              </button>
              <button
                type="button"
                className="qs-router-floating-btn"
                data-tooltip={copied === "key" ? "Copied!" : "Copy key"}
                aria-label="Copy key"
                onClick={() => void onCopy("key", fetchKey())}
              >
                {copied === "key" ? <CliCheckIcon size={11} /> : <CopySvgIcon size={11} />}
              </button>
            </div>
          </div>
          <button
            type="button"
            className="qs-router-server-btn qs-router-server-btn--icon"
            data-tooltip="Restart with a new key. Codex CLI is updated automatically; other tools need the new key."
            aria-label="Regenerate key"
            disabled={busy !== null}
            onClick={onStartRotateConfirm}
          >
            <KeyRegenerateIcon size={12} />
          </button>
        </div>
      </div>
    </div>
  );
};
