import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const types = readFileSync("src/utils/common/overlay-types.ts", "utf8");
const helpers =
  readFileSync("src/utils/common/app-overlay-helpers.ts", "utf8") +
  readFileSync("src/utils/common/app-overlay-quota-builders.ts", "utf8");
const app = readFileSync("src/components/overlay/OverlayApp.tsx", "utf8");

test("overlay payload types carry reset times", () => {
  assert.match(types, /fiveHourResetAt\?: string \| null;/);
  assert.match(types, /weeklyResetAt\?: string \| null;/);
  assert.match(types, /resetAt\?: string \| null;/);
  assert.match(types, /fiveHourDisabled\?: boolean;/);
  assert.doesNotMatch(app, /export interface OverlaySingleBar/);
});

test("overlay builders fill reset times from each provider's source", () => {
  assert.match(helpers, /epochToIso\(status\.fiveHour\?\.resetsAt\)/);
  assert.match(helpers, /epochToIso\(status\.sevenDay\?\.resetsAt\)/);
  assert.match(helpers, /epochToIso\(session\?\.fiveHour\?\.resetsAt\)/);
  assert.match(helpers, /resetAt: epochToIso\(w\.resetAt\)/);
  assert.match(helpers, /fiveHourResetAt: pool\.fiveHourReset \?\? null/);
  assert.match(helpers, /weeklyDisabled: Boolean\(pool\.weeklyDisabled\)/);
});
