import test from "node:test";
import assert from "node:assert/strict";
import {
  createEmptyLocalAntigravitySession,
  mergeDiskAntigravitySession,
} from "../../.test-build/local-antigravity-session.js";

test("disk identity is compared with the captured token owner, not the live status email", () => {
  // Live IDE status already switched the session email to the new account,
  // but the captured token still belongs to the previous account.
  const previous = {
    ...createEmptyLocalAntigravitySession(),
    email: "new@example.com",
    credits: { balance: 5 },
    quotas: [{ model: "Gemini", percent: 40 }],
    capturedAccount: { token: "old-access", refreshToken: "old-refresh", email: "old@example.com" },
  };
  const result = mergeDiskAntigravitySession(
    previous,
    {
      id: "disk",
      label: "disk",
      token: "new-access",
      refreshToken: "new-refresh",
      email: "new@example.com",
    },
    4000,
  );
  assert.equal(result.capturedAccount?.token, "new-access");
  assert.equal(result.capturedAccount?.refreshToken, "new-refresh");
  assert.equal(result.capturedAccount?.email, "new@example.com");
  assert.equal(result.credits, null);
  assert.deepEqual(result.quotas, []);
});
