import type { CodexAccount } from "../../../utils/common/types";
import type { ToastKind } from "../../common/Toast";
import { startCodexSiwcAuthorization } from "../../../utils/codex/pools/codex-siwc-link";

/** A separate best-effort consent flow. Codex login is already saved. */
export async function authorizeModelRoutingAfterCodexLogin(
  account: CodexAccount,
  showToast: (message: string, kind?: ToastKind) => void,
) {
  try {
    const result = await startCodexSiwcAuthorization(account);
    showToast(
      result === "started"
        ? "Codex saved. Approve separate Model Routing permission in your browser."
        : "Codex saved. Model Routing already authorized for this ChatGPT user.",
      "info",
    );
  } catch (error) {
    showToast(
      `Codex account saved; Model Routing still needs authorization: ${String(error)}`,
      "warning",
    );
  }
}
