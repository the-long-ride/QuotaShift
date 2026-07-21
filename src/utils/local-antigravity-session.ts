import type {
  AntigravityAccount,
  FullStatus,
  LocalAntigravitySession,
} from "./types";

export const LOCAL_ANTIGRAVITY_SESSION_KEY = "quotashift_local_antigravity_session_v1";

export function createEmptyLocalAntigravitySession(): LocalAntigravitySession {
  return {
    email: null,
    planTier: null,
    credits: null,
    quotas: [],
    online: false,
    lastSeenAt: null,
  };
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function mergeLocalAntigravityStatus(
  previous: LocalAntigravitySession,
  status: Partial<FullStatus> | null,
  now = Date.now(),
): LocalAntigravitySession {
  if (!status || status.online === false) {
    return { ...previous, online: false };
  }

  return {
    ...previous,
    email: status.email ?? previous.email,
    planTier: status.planTier ?? previous.planTier,
    credits: status.credits === undefined ? previous.credits : status.credits,
    quotas: status.quotas ?? previous.quotas,
    source: status.source ?? previous.source,
    accuracy: status.accuracy ?? previous.accuracy,
    online: true,
    lastSeenAt: now,
  };
}

export function canAddLocalSessionToMonitored(
  session: LocalAntigravitySession,
  accounts: AntigravityAccount[],
): boolean {
  const email = normalizeEmail(session.email ?? session.capturedAccount?.email);
  if (!email || !session.capturedAccount?.token) return false;
  return !accounts.some((account) => normalizeEmail(account.email) === email);
}

export function loadLocalAntigravitySession(): LocalAntigravitySession {
  if (typeof localStorage === "undefined") return createEmptyLocalAntigravitySession();
  try {
    const raw = localStorage.getItem(LOCAL_ANTIGRAVITY_SESSION_KEY);
    if (!raw) return createEmptyLocalAntigravitySession();
    const parsed = JSON.parse(raw) as Partial<LocalAntigravitySession>;
    return {
      ...createEmptyLocalAntigravitySession(),
      ...parsed,
      online: false,
      quotas: Array.isArray(parsed.quotas) ? parsed.quotas : [],
    };
  } catch {
    return createEmptyLocalAntigravitySession();
  }
}

export function saveLocalAntigravitySession(session: LocalAntigravitySession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_ANTIGRAVITY_SESSION_KEY, JSON.stringify(session));
}
