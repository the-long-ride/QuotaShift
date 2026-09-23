import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  COVERAGE_INCLUDES,
  COVERAGE_INFRASTRUCTURE_EXCLUDES,
  COVERAGE_SHIM_MANIFEST,
  COVERAGE_STATIC_EXCLUDES,
  DEFAULT_COVERAGE_THRESHOLDS,
  buildCoverageExcludes,
  parseCoverageOutput,
} from "../../scripts/check-coverage.mjs";

test("parseCoverageOutput parses standard node coverage report lines", () => {
  const sample = `
ℹ start of coverage report
ℹ -------------------------------------------------------------------------------------------------------------------------
ℹ file                           | line % | branch % | funcs % | uncovered lines
ℹ -------------------------------------------------------------------------------------------------------------------------
ℹ .test-build                    |        |          |         |
ℹ  account-last-used.js          | 100.00 |    96.88 |  100.00 |
ℹ  crypto.js                     |  90.50 |    80.00 |   85.00 |
ℹ -------------------------------------------------------------------------------------------------------------------------
ℹ all files                      |  95.25 |    88.44 |   92.50 |
ℹ -------------------------------------------------------------------------------------------------------------------------
ℹ end of coverage report
`;

  const { fileReports, allFilesReport } = parseCoverageOutput(sample);
  assert.equal(fileReports.length, 2);
  assert.equal(fileReports[0].name, "account-last-used.js");
  assert.equal(fileReports[0].lineCover, 100);
  assert.equal(fileReports[1].name, "crypto.js");
  assert.equal(fileReports[1].lineCover, 90.5);
  assert.ok(allFilesReport);
  assert.equal(allFilesReport.lineCover, 95.25);
  assert.equal(allFilesReport.branchCover, 88.44);
  assert.equal(allFilesReport.funcsCover, 92.5);
});

test("coverage scope includes every compiled production utility and excludes only infrastructure/exact generated shims", () => {
  assert.deepEqual(COVERAGE_INCLUDES, [".test-build/*.js", ".test-build/**/*.js"]);
  assert.equal(COVERAGE_SHIM_MANIFEST, ".test-build/coverage-shims.json");
  assert.deepEqual(COVERAGE_INFRASTRUCTURE_EXCLUDES, [
    ".test-build/index.js",
    ".test-build/types.js",
    ".test-build/account/index.js",
    ".test-build/antigravity/index.js",
    ".test-build/auth/index.js",
    ".test-build/claude/index.js",
    ".test-build/codex/index.js",
    ".test-build/common/index.js",
    ".test-build/claude/claude-account-types.js",
    ".test-build/codex/codex-router-types.js",
    ".test-build/common/overlay-types.js",
    ".test-build/common/types.js",
  ]);
  assert.equal(COVERAGE_STATIC_EXCLUDES.some((pattern) => pattern.startsWith("src/")), false);
  assert.equal(COVERAGE_STATIC_EXCLUDES.includes(".test-build/*.js"), false);

  const excludes = buildCoverageExcludes([
    ".test-build/account-order.js",
    ".test-build/account-order.js",
    ".test-build/codex-router.js",
  ]);
  assert.deepEqual(excludes.slice(-2), [
    ".test-build/account-order.js",
    ".test-build/codex-router.js",
  ]);
  assert.equal(excludes.includes(".test-build/index.js"), true);
  assert.equal(excludes.includes(".test-build/types.js"), true);
  assert.throws(() => buildCoverageExcludes([".test-build/account/account-order.js"]), /Invalid/);
  assert.throws(() => buildCoverageExcludes(["src/utils/common/app-constants.ts"]), /Invalid/);

  assert.deepEqual(DEFAULT_COVERAGE_THRESHOLDS, {
    lines: 95,
    branches: 85,
    functions: 95,
  });
});


test("test build records exact generated compatibility shims instead of a root wildcard", () => {
  const source = readFileSync(new URL("../../scripts/test.mjs", import.meta.url), "utf8");
  assert.match(source, /generatedCoverageShims\.push/);
  assert.match(source, /coverage-shims\.json/);
  assert.doesNotMatch(source, /coverageShims\.push\([^)]*index\.js/);
});
