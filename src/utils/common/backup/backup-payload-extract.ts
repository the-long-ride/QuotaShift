export const isCodexCandidate = (item: any): boolean =>
  Boolean(
    item &&
    typeof item === "object" &&
    (item.apiKey ||
      item.tokens ||
      item.provider === "codex" ||
      item.lastPlan ||
      item.resetCredits ||
      (item.id && typeof item.id === "string" && item.id.includes("oauth"))),
  );

export const isAntigravityCandidate = (item: any): boolean =>
  Boolean(
    item &&
    typeof item === "object" &&
    (item.token ||
      item.refreshToken ||
      item.refresh_token ||
      item.provider === "antigravity" ||
      (item.id && typeof item.id === "string" && item.id.startsWith("ag-acct"))),
  );

export const extractBackupPayload = (data: any) => {
  if (!data || typeof data !== "object") {
    return { agAccounts: [], cxAccounts: [], pools: [], cliPools: [] };
  }
  let agAccounts: any[] = [];
  let cxAccounts: any[] = [];
  let pools: any[] = [];
  let cliPools: any[] = [];

  if (Array.isArray(data)) {
    for (const item of data) {
      if (isAntigravityCandidate(item)) agAccounts.push(item);
      else if (isCodexCandidate(item) || (item && typeof item === "object" && item.email))
        cxAccounts.push(item);
    }
  } else {
    if (data.antigravity) {
      if (Array.isArray(data.antigravity.accounts)) agAccounts = [...data.antigravity.accounts];
      else if (Array.isArray(data.antigravity)) agAccounts = [...data.antigravity];
      if (Array.isArray(data.antigravity.cliPools)) cliPools.push(...data.antigravity.cliPools);
    } else if (Array.isArray(data.antigravityAccounts)) {
      agAccounts = [...data.antigravityAccounts];
    }

    if (data.codex) {
      const pData = data.codex;
      if (Array.isArray(pData.accounts)) cxAccounts = [...pData.accounts];
      else if (Array.isArray(pData)) cxAccounts = [...pData];
      if (Array.isArray(pData.pools)) pools = [...pData.pools];
      if (Array.isArray(pData.cliPools)) cliPools.push(...pData.cliPools);
    } else if (Array.isArray(data.codexAccounts)) {
      cxAccounts = [...data.codexAccounts];
    } else if (Array.isArray(data.codex_accounts)) {
      cxAccounts = [...data.codex_accounts];
    }

    if (data.platforms && typeof data.platforms === "object") {
      if (data.platforms.antigravity) {
        if (Array.isArray(data.platforms.antigravity.accounts))
          agAccounts = [...agAccounts, ...data.platforms.antigravity.accounts];
        else if (Array.isArray(data.platforms.antigravity))
          agAccounts = [...agAccounts, ...data.platforms.antigravity];
      }
      if (data.platforms.codex) {
        if (Array.isArray(data.platforms.codex.accounts))
          cxAccounts = [...cxAccounts, ...data.platforms.codex.accounts];
        else if (Array.isArray(data.platforms.codex))
          cxAccounts = [...cxAccounts, ...data.platforms.codex];
        if (Array.isArray(data.platforms.codex.pools))
          pools = [...pools, ...data.platforms.codex.pools];
      }
    }

    if (Array.isArray(data.accounts)) {
      for (const item of data.accounts) {
        if (isAntigravityCandidate(item)) agAccounts.push(item);
        else if (isCodexCandidate(item) || (item && typeof item === "object" && item.email))
          cxAccounts.push(item);
      }
    }

    if (Array.isArray(data.pools)) {
      pools = [...pools, ...data.pools];
    }

    if (Array.isArray(data.cliPools)) {
      cliPools = [...data.cliPools];
    } else if (Array.isArray(data.cli_pools)) {
      cliPools = [...data.cli_pools];
    }
  }

  return { agAccounts, cxAccounts, pools, cliPools };
};
