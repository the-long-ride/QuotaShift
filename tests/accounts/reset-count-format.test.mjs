import test from "node:test";
import assert from "node:assert/strict";
import { formatResetCount } from "../../.test-build/common/format-reset-count.js";

test("reset counts use the same compact reset(s) label for every platform", () => {
  assert.equal(formatResetCount(0), "0 reset(s)");
  assert.equal(formatResetCount(1), "1 reset(s)");
  assert.equal(formatResetCount(4), "4 reset(s)");
});
