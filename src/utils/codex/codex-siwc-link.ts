import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { deobfuscate } from "../auth/auth";
import type { CodexAccount } from "../common/types";
import type { SiwcAccountView } from "./siwc-types";

/**
 * Identity *hint* from a previously saved Codex ID token. This local decode
 * does NOT verify the old JWT. The SIWC callback independently verifies its
 * newly issued ID token and requires the same subject before storing tokens.
 * Email and workspace ID are deliberately not used as identity keys.
 */
export function codexOpenAiSubject(account: CodexAccount): string | null {
  try {
    const data = JSON.parse(deobfuscate(account.apiKey));
    if (!data.isOAuth || typeof data.idToken !== "string") return null;
    const payload = data.idToken.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=")));
    if (
      claims.iss !== "https://auth.openai.com" ||
      typeof claims.sub !== "string" ||
      !claims.sub ||
      claims.sub.length > 256
    )
      return null;
    return claims.sub;
  } catch {
    return null;
  }
}

export function getAuthorizedSiwcRegistration(
  account: CodexAccount,
  registrations: SiwcAccountView[],
): SiwcAccountView | null {
  const subject = codexOpenAiSubject(account);
  if (!subject) return null;
  return (
    registrations.find(
      (registration) =>
        registration.subject === subject &&
        registration.linkedCodexAccountId === account.id &&
        registration.isRoutable,
    ) ?? null
  );
}

export async function startCodexSiwcAuthorization(
  account: CodexAccount,
  reauthorize = false,
  mode: "open" | "copy" = "open",
): Promise<"already-authorized" | "started" | "copied"> {
  const expectedSubject = codexOpenAiSubject(account);
  if (!expectedSubject) {
    throw new Error(
      "This Codex account has no usable OpenAI identity token. Re-authenticate it using Codex browser login before authorizing Model Routing.",
    );
  }
  const registrations = await invoke<SiwcAccountView[]>("list_siwc_accounts");
  const existing = registrations.find((entry) => entry.linkedCodexAccountId === account.id);
  if (existing && existing.subject !== expectedSubject) {
    throw new Error("This Codex workspace was previously linked to a different ChatGPT identity.");
  }
  if (existing?.isRoutable && !reauthorize) return "already-authorized";
  const authorizationUrl = await invoke<string>("start_siwc_sign_in", {
    registrationId: existing?.id ?? null,
    expectedSubject,
    linkedCodexAccountId: account.id,
  });
  if (mode === "copy") {
    await navigator.clipboard.writeText(authorizationUrl);
    return "copied";
  }
  await openUrl(authorizationUrl);
  return "started";
}
