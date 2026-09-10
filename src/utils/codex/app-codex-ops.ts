import { invoke } from "@tauri-apps/api/core";
import { deobfuscate } from "../auth/auth";
import { CodexAccount, CodexMonitoredInfo } from "../common/types";

export const fetchCodexUsageData = async (apiKey: string) => {
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const subRes = await fetch("https://api.openai.com/v1/dashboard/billing/subscription", {
    headers,
  });
  if (!subRes.ok) {
    if (subRes.status === 401)
      throw new Error("Invalid API key. Please check your key and try again.");
    throw new Error(`Subscription API error: ${subRes.status} ${subRes.statusText}`);
  }
  const sub = await subRes.json();

  const hardLimit = (sub.hard_limit_usd ?? sub.hard_limit ?? 0) as number;
  const softLimit = (sub.soft_limit_usd ?? sub.soft_limit ?? 0) as number;
  const planName = (sub.plan?.title ?? sub.plan?.id ?? "Pay-as-you-go") as string;
  const creditBalance = (sub.system_hard_limit_usd ?? hardLimit) as number;

  const now = new Date();
  const startDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const endDate = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(
    tomorrow.getDate(),
  ).padStart(2, "0")}`;

  const usageRes = await fetch(
    `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
    { headers },
  );

  const models: any[] = [];
  if (usageRes.ok) {
    const usageData = await usageRes.json();
    const byModel: Record<string, { tokens: number; cost: number }> = {};
    const dailyCosts = (usageData.daily_costs ?? []) as any[];
    for (const day of dailyCosts) {
      const lineItems = (day.line_items ?? []) as any[];
      for (const item of lineItems) {
        const modelName = (item.name ?? "unknown") as string;
        const cost = (item.cost ?? 0) as number;
        if (!byModel[modelName]) byModel[modelName] = { tokens: 0, cost: 0 };
        byModel[modelName].cost += cost;
      }
    }
    for (const [modelName, data] of Object.entries(byModel)) {
      if (data.cost > 0) {
        models.push({
          model: modelName,
          totalTokens: data.tokens,
          costUsd: data.cost / 100,
        });
      }
    }
    models.sort((a, b) => b.costUsd - a.costUsd);
  }

  return {
    planName,
    creditBalance,
    hardLimit,
    softLimit,
    models,
    periodStart: startDate,
    periodEnd: endDate,
  };
};

export const updateMonitoredCodexTray = async (account: CodexAccount, info: any): Promise<void> => {
  try {
    const rawKey = deobfuscate(account.apiKey);
    const isOAuth = rawKey.startsWith("{");
    let primaryPercent: number | null = null;

    if (isOAuth) {
      const primary = info.primary;
      const monthly = info.monthly;
      const targetWindow = primary || monthly;
      if (targetWindow && targetWindow.used_percent !== undefined) {
        primaryPercent = Math.max(0, 100 - Math.round(targetWindow.used_percent));
      }
    } else if (info.primaryPercent !== undefined) {
      primaryPercent = info.primaryPercent;
    }

    const payload: CodexMonitoredInfo = {
      accountId: account.id,
      label: account.label || account.email || "Codex",
      primaryPercent,
      primaryLabel: info.primaryLabel || "5-hour",
      secondaryPercent: info.secondaryPercent ?? null,
      secondaryLabel: info.secondaryLabel || "Weekly",
    };

    await invoke("set_monitored_codex", { info: payload });
  } catch (err) {
    console.error("Failed to update monitored Codex tray:", err);
  }
};

export const syncActiveCodexAccount = async (
  activeCodexId: string | null,
  codexAccounts: CodexAccount[],
): Promise<void> => {
  const current = activeCodexId
    ? codexAccounts.find((a) => a.id === activeCodexId)
    : codexAccounts[0];
  if (!current) return;
  try {
    const rawKey = deobfuscate(current.apiKey);
    const isOAuth = rawKey.startsWith("{");
    if (isOAuth) {
      const oauthData = JSON.parse(rawKey);
      await invoke("sync_codex_config", {
        account: {
          id: current.id,
          email: current.email,
          auth: {
            OAuth: {
              access_token: oauthData.accessToken,
              refresh_token: oauthData.refreshToken || null,
              chatgpt_account_id: oauthData.accountId,
            },
          },
        },
      });
    }
  } catch (error) {
    console.warn("Failed to sync active Codex account:", error);
  }
};
