import type {
  AntigravityAccount,
  FullStatus,
  LocalAntigravitySession,
  QuotaData,
} from "../common/types";

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

export function normalizeLocalSessionQuotas(quotas: unknown[] | undefined | null): QuotaData[] {
  return (quotas || []).filter((quota): quota is QuotaData => {
    if (!quota || typeof quota !== "object") return false;
    const model = (quota as Partial<QuotaData>).model;
    return typeof model === "string" && model.trim().length > 0;
  });
}

export function normalizeEmail(email: string | null | undefined): string {
  return (email || "").trim().toLowerCase();
}

export function mergeDiskAntigravitySession(
  previous: LocalAntigravitySession,
  candidate: AntigravityAccount,
  now = Date.now(),
): LocalAntigravitySession {
  // Compare against the owner of the captured token: live IDE status can move
  // `previous.email` to a new account while the captured token is still stale.
  const previousEmail = normalizeEmail(previous.capturedAccount?.email ?? previous.email);
  const candidateEmail = normalizeEmail(candidate.email);
  const sameIdentity = Boolean(previousEmail && candidateEmail && previousEmail === candidateEmail);
  const previousCaptured = previous.capturedAccount;
  const preserveCurrentCredentials = Boolean(
    sameIdentity && previousCaptured && (previousCaptured.token || previousCaptured.refreshToken),
  );

  return {
    ...previous,
    email: candidate.email ?? previous.email,
    planTier: candidate.lastPlan ?? previous.planTier,
    credits: sameIdentity ? previous.credits : null,
    quotas: sameIdentity ? normalizeLocalSessionQuotas(previous.quotas) : [],
    online: true,
    lastSeenAt: now,
    capturedAccount: {
      token: preserveCurrentCredentials ? previousCaptured!.token : candidate.token,
      refreshToken: preserveCurrentCredentials
        ? (previousCaptured!.refreshToken ?? candidate.refreshToken)
        : candidate.refreshToken,
      profileUrl: candidate.profileUrl ?? previousCaptured?.profileUrl,
      email: candidate.email ?? previousCaptured?.email,
      authMethod: candidate.authMethod ?? previousCaptured?.authMethod,
    },
  };
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
      quotas: normalizeLocalSessionQuotas(Array.isArray(parsed.quotas) ? parsed.quotas : []),
    };
  } catch {
    return createEmptyLocalAntigravitySession();
  }
}

export function saveLocalAntigravitySession(session: LocalAntigravitySession): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(LOCAL_ANTIGRAVITY_SESSION_KEY, JSON.stringify(session));
}
