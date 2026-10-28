import type { CodexAccount } from "../../common/types";

export const normalizeDetectedCodexPlan = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const plan = value.trim();
  return plan.length > 0 ? plan : null;
};

export const applyDetectedCodexPlan = (
  accounts: CodexAccount[],
  accountId: string,
  value: unknown,
): CodexAccount[] => {
  const plan = normalizeDetectedCodexPlan(value);
  if (!plan) return accounts;
  const index = accounts.findIndex((account) => account.id === accountId);
  if (index < 0 || accounts[index].lastPlan === plan) return accounts;
  const next = accounts.slice();
  next[index] = { ...accounts[index], lastPlan: plan };
  return next;
};
