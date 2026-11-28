import { invoke } from "@tauri-apps/api/core";
import {
  decodeJwtEmail,
  decodeJwtProfile,
  deobfuscate,
  parseOpenAiAuthClaims,
  type JwtProfile,
  type OpenAiAuthClaims,
} from "../../../utils/auth/auth";
import type { CodexAccount } from "../../../utils/common/types";
import { normalizeAccountIdentity } from "../../../utils/account/current-account";
import { createApiKeyCodexAccount } from "../siwc/codex-add-account-helpers";

export interface NormalizedChatGptWorkspaceItem {
  id: string;
  name: string;
  structure: "personal" | "workspace";
  planType: string | null;
}

export interface DiscoveredOAuthSession {
  accessToken: string;
  refreshToken: string | undefined;
  idToken: string | null;
  accountsResponse: any;
  authClaims: OpenAiAuthClaims | null;
  profile: JwtProfile | null;
  email: string | undefined;
  discoveredItems: NormalizedChatGptWorkspaceItem[];
  connected: NormalizedChatGptWorkspaceItem[];
  skipped: NormalizedChatGptWorkspaceItem[];
}

const WORKSPACE_STRUCTURES = new Set(["workspace", "team", "organization"]);
const WORKSPACE_PLAN_RE = /business|team|enterprise|edu|workspace/i;

function trimmed(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function inferStructure(entity: any, planType: string | null): "personal" | "workspace" {
  const rawStructure = trimmed(entity?.structure)?.toLowerCase();
  if (rawStructure === "personal" || entity?.is_personal === true) return "personal";
  if (rawStructure && WORKSPACE_STRUCTURES.has(rawStructure)) return "workspace";
  if (planType && WORKSPACE_PLAN_RE.test(planType)) return "workspace";
  const name = trimmed(entity?.name);
  return name && name.toLowerCase() !== "personal" ? "workspace" : "personal";
}

function toNormalizedItem(
  raw: any,
  authClaims: OpenAiAuthClaims | null,
): NormalizedChatGptWorkspaceItem | null {
  const entity = raw?.account && typeof raw.account === "object" ? raw.account : raw;
  const id = trimmed(raw?.id ?? raw?.account_id ?? entity?.account_id ?? entity?.id);
  if (!id) return null;
  const planType =
    trimmed(entity?.plan_type ?? raw?.plan_type) ??
    (id === authClaims?.chatgptAccountId ? (authClaims?.chatgptPlanType ?? null) : null);
  const structure = inferStructure(entity, planType);
  const name =
    trimmed(entity?.name ?? raw?.name) || (structure === "personal" ? "Personal" : "Workspace");
  return { id, name, structure, planType };
}

export function normalizeChatGptWorkspaceItems(
  accountsResponse: any,
  authClaims: OpenAiAuthClaims | null,
): NormalizedChatGptWorkspaceItem[] {
  const rawList: any[] = Array.isArray(accountsResponse?.items)
    ? accountsResponse.items
    : accountsResponse?.accounts && typeof accountsResponse.accounts === "object"
      ? Object.values(accountsResponse.accounts)
      : [];

  const seen = new Set<string>();
  const items: NormalizedChatGptWorkspaceItem[] = [];
  for (const raw of rawList) {
    const item = toNormalizedItem(raw, authClaims);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
  }

  if (items.length === 0 && authClaims?.chatgptAccountId) {
    const org = authClaims.organizations.find((o) => o.id === authClaims.chatgptAccountId);
    const structure = inferStructure(
      { name: org?.title, structure: org ? "workspace" : undefined },
      authClaims.chatgptPlanType,
    );
    items.push({
      id: authClaims.chatgptAccountId,
      name: org?.title || (structure === "personal" ? "Personal" : "Workspace"),
      structure,
      planType: authClaims.chatgptPlanType,
    });
  }
  return items;
}

export async function probeScopedChatGptWorkspaces(
  items: NormalizedChatGptWorkspaceItem[],
  authClaims: OpenAiAuthClaims | null,
  probeUsage: (accountId: string) => Promise<any>,
): Promise<{
  connected: NormalizedChatGptWorkspaceItem[];
  skipped: NormalizedChatGptWorkspaceItem[];
}> {
  if (items.length <= 1) return { connected: items, skipped: [] };

  const results = await Promise.all(
    items.map(async (item) => {
      try {
        const usage = await probeUsage(item.id);
        const returnedId = trimmed(usage?.account_id);
        const mismatch = Boolean(returnedId && returnedId !== item.id);
        const returnedPlan = trimmed(usage?.plan_type);
        return {
          item: returnedPlan && !mismatch ? { ...item, planType: returnedPlan } : item,
          ok: !mismatch,
        };
      } catch {
        return { item, ok: false };
      }
    }),
  );

  const connected = results.filter((entry) => entry.ok).map((entry) => entry.item);
  if (connected.length === 0) {
    const bound = authClaims?.chatgptAccountId
      ? items.filter((item) => item.id === authClaims.chatgptAccountId)
      : [];
    const fallback = bound.length > 0 ? bound : items;
    return { connected: fallback, skipped: items.filter((item) => !fallback.includes(item)) };
  }

  const connectedIds = new Set(connected.map((item) => item.id));
  return { connected, skipped: items.filter((item) => !connectedIds.has(item.id)) };
}

export async function exchangeAndDiscoverWorkspaces(
  code: string,
  setStatus: (text: string) => void,
): Promise<{ ok: true; session: DiscoveredOAuthSession } | { ok: false; error: string }> {
  const tokenJson = await invoke<any>("exchange_oauth_token", { code });
  const accessToken = tokenJson.access_token;
  if (!accessToken) return { ok: false, error: "Failed to obtain access token." };

  setStatus("Retrieving your ChatGPT workspaces...");
  const accountsResponse = await invoke<any>("fetch_chatgpt_workspaces", { accessToken });
  const idToken: string | null = tokenJson.id_token || null;
  const authClaims = parseOpenAiAuthClaims(idToken) ?? parseOpenAiAuthClaims(accessToken);
  const discoveredItems = normalizeChatGptWorkspaceItems(accountsResponse, authClaims);
  if (discoveredItems.length === 0) {
    return { ok: false, error: "No ChatGPT workspaces found on your account." };
  }

  const profile = decodeJwtProfile(idToken);
  const email = profile?.email || decodeJwtEmail(idToken) || undefined;
  const { connected, skipped } = await probeScopedChatGptWorkspaces(
    discoveredItems,
    authClaims,
    (accountId) =>
      invoke<any>("fetch_chatgpt_usage", {
        accessToken,
        accountId,
        email: email ?? null,
        skipResets: true,
      }),
  );
  return {
    ok: true,
    session: {
      accessToken,
      refreshToken: tokenJson.refresh_token,
      idToken,
      accountsResponse,
      authClaims,
      profile,
      email,
      discoveredItems,
      connected,
      skipped,
    },
  };
}

function storedOAuthAccountId(account: CodexAccount): string {
  try {
    const parsed = JSON.parse(deobfuscate(account.apiKey));
    return typeof parsed?.accountId === "string" ? parsed.accountId.trim() : "";
  } catch {
    return "";
  }
}

export function findExistingWorkspaceAccount(
  accounts: CodexAccount[],
  accountId: string,
  itemId: string,
  email: string | undefined,
  allowSharedUpgrade: boolean,
): CodexAccount | undefined {
  const direct = accounts.find(
    (account) => account.id === accountId || storedOAuthAccountId(account) === itemId,
  );
  if (direct || !allowSharedUpgrade) return direct;
  const normalizedEmail = normalizeAccountIdentity(email);
  if (!normalizedEmail) return undefined;
  return accounts.find(
    (account) =>
      normalizeAccountIdentity(account.email) === normalizedEmail &&
      storedOAuthAccountId(account) === "shared-local-session",
  );
}

export function codexProfileMeta(
  item: NormalizedChatGptWorkspaceItem,
  workspaceName: string,
): Partial<CodexAccount> {
  return {
    ...(item.planType ? { lastPlan: item.planType } : {}),
    profileType: item.structure,
    ...(item.structure === "workspace" ? { workspaceName } : {}),
  };
}

export function formatSkippedWorkspacesNotice(
  connected: NormalizedChatGptWorkspaceItem[],
  skipped: NormalizedChatGptWorkspaceItem[],
): string | null {
  if (skipped.length === 0) return null;
  const joined = (list: NormalizedChatGptWorkspaceItem[]) => list.map((i) => i.name).join(", ");
  return `Connected ${joined(connected)}. Sign in again and choose ${joined(skipped)} to monitor it separately.`;
}

export function validateAndBuildApiKeyAccount(
  labelInput: string,
  apiKeyInput: string,
):
  { ok: true; account: CodexAccount } | { ok: false; focusLabel?: boolean; alertMessage?: string } {
  const label = labelInput.trim();
  const apiKey = apiKeyInput.trim();
  if (!label) return { ok: false, focusLabel: true };
  if (!apiKey || !apiKey.startsWith("sk-")) {
    return {
      ok: false,
      alertMessage:
        "API key must start with 'sk-'. Find your key at platform.openai.com/account/api-keys",
    };
  }
  return { ok: true, account: createApiKeyCodexAccount(label, apiKey) };
}
