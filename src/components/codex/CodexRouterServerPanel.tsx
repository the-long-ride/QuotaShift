import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { CodexAccount, CodexRouterStatus } from "../../utils/common/types";
import type { SiwcAccountView } from "../../utils/codex/siwc-types";
import { CODEX_ROUTER_PORT_KEY, loadRouterPort } from "../../utils/common/app-constants";
import { CodexRouterServerLogs } from "./CodexRouterServerLogs";
import { CliResetIcon } from "../common/CliPoolIcons";
import { CodexRouterServerControls } from "./CodexRouterServerControls";
import { CodexRegenerateKeyDialog } from "./CodexRegenerateKeyDialog";
import { CodexRouterServerStats } from "./CodexRouterServerStats";
import { CommonSwitch } from "../common/CommonSwitch";
import { CustomDialog } from "../common/CustomDialog";
import { showAppToast } from "../../utils/common/app-toast";
import type { ToastKind } from "../common/Toast";
import {
  DEFAULT_ROUTER_STATUS,
  formatCacheHitPercentage,
  formatCompactTokens,
  formatUptime,
  parsePortInput,
} from "./codex-router-server-helpers";

export { formatCacheHitPercentage, formatCompactTokens, formatUptime, parsePortInput };

interface CodexRouterServerPanelProps {
  status: CodexRouterStatus | null;
  accounts: CodexAccount[];
  siwcAccounts: SiwcAccountView[];
  showToast?: (message: string, kind?: ToastKind) => void;
  poolRoutingEnabled?: boolean;
  poolRoutingBusy?: boolean;
  enabledPoolCount?: number;
  onToggleRouting?: () => void;
}

type Notice = { kind: "ok" | "error"; text: string } | null;
type RestartAction = "restart" | "port" | "rotate";

const DOT = "·";

export const CodexRouterServerPanel: React.FC<CodexRouterServerPanelProps> = ({
  status,
  accounts,
  siwcAccounts,
  showToast,
  poolRoutingEnabled = false,
  poolRoutingBusy = false,
  enabledPoolCount = 0,
  onToggleRouting,
}) => {
  const [liveStatus, setLiveStatus] = useState<CodexRouterStatus>(
    () => status ?? DEFAULT_ROUTER_STATUS,
  );
  const [portInput, setPortInput] = useState(() => String(loadRouterPort() ?? ""));
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [busy, setBusy] = useState<RestartAction | null>(null);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    if (status) setLiveStatus(status);
    else setLiveStatus((prev) => ({ ...prev, running: false }));
  }, [status]);

  const baseUrl = liveStatus.baseUrl ?? "";
  const parsedPort = parsePortInput(portInput);
  const savedPort = loadRouterPort();
  const fellBack = Boolean(savedPort && liveStatus.port && savedPort !== liveStatus.port);
  const lastAccountId = liveStatus.lastRoutedAccountId;
  const lastAccount = lastAccountId
    ? (accounts.find((account) => account.id === lastAccountId)?.email ??
      siwcAccounts.find((account) => account.id === lastAccountId)?.email ??
      lastAccountId)
    : null;

  const copy = async (label: string, text: string | Promise<string>) => {
    try {
      await navigator.clipboard.writeText(await text);
      setCopied(label);
      setTimeout(() => setCopied((current) => (current === label ? null : current)), 1500);
    } catch (error) {
      setNotice({ kind: "error", text: `Copy failed: ${String(error)}` });
    }
  };

  const fetchKey = () => invoke<string>("get_codex_router_key");

  const restart = async (action: RestartAction, port: number | null, success: string) => {
    setBusy(action);
    setNotice(null);
    try {
      setLiveStatus(
        await invoke<CodexRouterStatus>("restart_codex_router", {
          port,
          rotateKey: action === "rotate",
          // Only Apply states an intent: a typed port pins it, an empty one unpins it.
          pin: action === "port" ? port !== null : null,
        }),
      );
      if (action === "rotate") setRevealedKey(null);
      setNotice({ kind: "ok", text: success });
      return true;
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
      return false;
    } finally {
      setBusy(null);
      setConfirmRotate(false);
    }
  };

  const handleConfirmRotate = async (updateClaudeProfiles: boolean) => {
    setConfirmRotate(false);
    setBusy("rotate");
    setNotice(null);
    try {
      const nextStatus = await invoke<CodexRouterStatus>("restart_codex_router", {
        port: liveStatus.port ?? null,
        rotateKey: true,
        pin: null,
      });
      setLiveStatus(nextStatus);
      setRevealedKey(null);

      let updatedProfileNames: string[] = [];
      if (updateClaudeProfiles) {
        try {
          const newKey = await invoke<string>("get_codex_router_key");
          updatedProfileNames = await invoke<string[]>("update_claude_profiles_routing_key", {
            newKey,
          });
        } catch (error) {
          console.error("Failed to update Claude profiles with new key:", error);
        }
      }

      let toastMsg = "QuotaShift model routing key has been re-generated.";
      if (updateClaudeProfiles && updatedProfileNames.length > 0) {
        toastMsg = `QuotaShift model routing key has been updated for these claude profiles: ${updatedProfileNames.join(", ")}`;
      }

      showAppToast(toastMsg, "success");
      if (showToast) showToast(toastMsg, "success");
      setNotice({ kind: "ok", text: toastMsg });
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    } finally {
      setBusy(null);
    }
  };

  const applyPort = async () => {
    if (parsedPort === "invalid") {
      setNotice({ kind: "error", text: "Port must be 1024-65535, or empty for a random port" });
      return;
    }
    const target = parsedPort ? `port ${parsedPort}` : "a random port";
    if (!(await restart("port", parsedPort, `Moved to ${target}. The key is unchanged.`))) return;
    try {
      if (parsedPort) localStorage.setItem(CODEX_ROUTER_PORT_KEY, String(parsedPort));
      else localStorage.removeItem(CODEX_ROUTER_PORT_KEY);
    } catch {
      // Storage can be unavailable; the running router already uses the new port.
    }
  };

  const toggleReveal = async () => {
    if (revealedKey) return setRevealedKey(null);
    try {
      setRevealedKey(await fetchKey());
    } catch (error) {
      setNotice({ kind: "error", text: String(error) });
    }
  };

  const handleToggleRouting = () => {
    if (poolRoutingEnabled) {
      setConfirmStop(true);
    } else {
      onToggleRouting?.();
    }
  };

  const portUnchanged =
    !fellBack && parsedPort !== "invalid" && (parsedPort ?? null) === (savedPort ?? null);

  return (
    <section className="qs-router-server" aria-label="Router server">
      <header className="qs-router-server-head">
        <div className="qs-router-server-title">
          <span className="qs-model-pools-heading-title">Router Server</span>
          <span className="qs-router-server-badge">
            <span
              className={`qs-router-server-dot${liveStatus.running ? " qs-router-server-dot--running" : " qs-router-server-dot--stopped"}`}
              aria-hidden="true"
            />
            {liveStatus.running ? "Running" : "Stopped"}
            {liveStatus.running && (
              <>
                {" "}
                {DOT} port {liveStatus.port ?? "-"} {DOT} up {formatUptime(liveStatus.uptimeSecs)}
              </>
            )}
          </span>
          <CommonSwitch
            checked={Boolean(poolRoutingEnabled)}
            onToggle={handleToggleRouting}
            tooltip={
              !poolRoutingEnabled && enabledPoolCount === 0
                ? "Enable at least one model pool before starting the router server"
                : poolRoutingEnabled
                  ? "Stop Router Server"
                  : "Start Router Server"
            }
            ariaLabel="Toggle Router Server"
            disabled={poolRoutingBusy || (!poolRoutingEnabled && enabledPoolCount === 0)}
          />
        </div>

        <div className="qs-router-server-head-right">
          <CodexRouterServerStats status={liveStatus} lastAccount={lastAccount} />

          <button
            type="button"
            className="qs-router-server-btn qs-router-server-btn--icon qs-router-server-btn--primary"
            data-tooltip="Restart server (same port and key)"
            aria-label="Restart server"
            disabled={busy !== null}
            onClick={() =>
              void restart(
                "restart",
                liveStatus.port ?? null,
                "Router restarted. Port and key unchanged.",
              )
            }
          >
            <CliResetIcon size={12} />
          </button>
        </div>
      </header>

      {(notice || fellBack) && (
        <div
          className={`qs-router-server-notice qs-router-server-notice--${notice?.kind ?? "error"}`}
          role={notice?.kind === "ok" ? "status" : "alert"}
        >
          {notice?.text ??
            `Saved port ${savedPort} was taken, so the router started on a random port. Use Apply to try it again.`}
        </div>
      )}

      <CodexRouterServerControls
        baseUrl={baseUrl}
        portInput={portInput}
        parsedPort={parsedPort}
        portUnchanged={portUnchanged}
        revealedKey={revealedKey}
        busy={busy}
        confirmRotate={confirmRotate}
        copied={copied}
        onSetPortInput={setPortInput}
        onApplyPort={() => void applyPort()}
        onToggleReveal={() => void toggleReveal()}
        onCopy={(label, text) => void copy(label, text)}
        onStartRotateConfirm={() => setConfirmRotate(true)}
        onCancelRotateConfirm={() => setConfirmRotate(false)}
        onConfirmRotate={() => void handleConfirmRotate(true)}
        fetchKey={fetchKey}
      />

      <CodexRegenerateKeyDialog
        isOpen={confirmRotate}
        busy={busy === "rotate"}
        onClose={() => setConfirmRotate(false)}
        onConfirm={(updateProfiles) => void handleConfirmRotate(updateProfiles)}
      />

      {confirmStop && (
        <CustomDialog
          title="Stop Router Server"
          message="Are you sure you want to stop the Router Server? Claude Code and other tools routed through this endpoint will be unable to process requests until it is restarted."
          isConfirm={true}
          confirmText="Stop Server"
          confirmVariant="danger"
          confirmTooltip="Stop the router server"
          cancelTooltip="Keep the router server running"
          onClose={(confirmed) => {
            setConfirmStop(false);
            if (confirmed) {
              onToggleRouting?.();
            }
          }}
        />
      )}

      <CodexRouterServerLogs />
    </section>
  );
};
