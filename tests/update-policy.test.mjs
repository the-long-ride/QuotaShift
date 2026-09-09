import test from "node:test";
import assert from "node:assert/strict";
import {
  OFFICIAL_RELEASE_URL,
  isNewerVersion,
} from "../.test-build/update-policy.js";

test("the update policy exposes only the official HTTPS release page", () => {
  assert.equal(
    OFFICIAL_RELEASE_URL,
    "https://github.com/the-long-ride/QuotaShift/releases/latest"
  );
});

test("version policy reports only a strictly newer three-part release", () => {
  assert.equal(isNewerVersion("0.0.11", "0.0.12"), true);
  assert.equal(isNewerVersion("0.0.11", "0.1.0"), true);
  assert.equal(isNewerVersion("1.2.3", "1.2.3"), false);
  assert.equal(isNewerVersion("1.2.3", "1.2.2"), false);
  assert.equal(isNewerVersion("1.2", "1.2.0"), false);
});
