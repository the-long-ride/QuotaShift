import test from "node:test";
import assert from "node:assert/strict";

import { resolveAccountCaptureLabel } from "../../.test-build/account/capture-label.js";

test("shared capture label resolver prioritizes provider name and manual fallback", () => {
  assert.equal(
    resolveAccountCaptureLabel({
      providerName: " Provider Owner ",
      fallbackLabel: "Manual Label",
      email: "account@example.com",
      defaultLabel: "Platform",
    }),
    "Provider Owner",
  );
  assert.equal(
    resolveAccountCaptureLabel({
      fallbackLabel: " Manual Label ",
      email: "account@example.com",
      defaultLabel: "Platform",
    }),
    "Manual Label",
  );
});

test("blank capture label falls back to email local part, then platform name", () => {
  assert.equal(
    resolveAccountCaptureLabel({ email: "account@example.com", defaultLabel: "Platform" }),
    "account",
  );
  assert.equal(
    resolveAccountCaptureLabel({ email: "@example.com", defaultLabel: "Platform" }),
    "Platform",
  );
  assert.equal(resolveAccountCaptureLabel({ defaultLabel: "Platform" }), "Platform");
});
