import test from "node:test";
import assert from "node:assert/strict";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_LIMITS,
  IGNORED_DIRS,
  isTestFile,
  countFileLines,
  verifyLoc,
} from "../scripts/check-loc.mjs";

test("DEFAULT_LIMITS matches exact specification", () => {
  assert.equal(DEFAULT_LIMITS[".tsx"], 350, "tsx limit must be 350 LOC");
  assert.equal(DEFAULT_LIMITS[".ts"], 300, "ts limit must be 300 LOC");
  assert.equal(DEFAULT_LIMITS[".rs"], 300, "rs limit must be 300 LOC");
  assert.equal(DEFAULT_LIMITS[".css"], 600, "css limit must be 600 LOC");
});

test("isTestFile identifies test directories and naming patterns", () => {
  // Directory-based exclusions
  assert.equal(isTestFile("tests/foo.ts"), true);
  assert.equal(isTestFile("tests/nested/deep/bar.rs"), true);
  assert.equal(isTestFile("src-tauri/tests/contract.rs"), true);
  assert.equal(isTestFile("src/components/__tests__/Header.tsx"), true);
  assert.equal(isTestFile("tests/fixtures/data.ts"), true);

  // Filename patterns
  assert.equal(isTestFile("src/components/Header.test.tsx"), true);
  assert.equal(isTestFile("src/utils/calc.spec.ts"), true);
  assert.equal(isTestFile("src-tauri/src/test_helper.rs"), true);
  assert.equal(isTestFile("src-tauri/src/session_test.rs"), true);
  assert.equal(isTestFile("src-tauri/src/tests.rs"), true);
  assert.equal(isTestFile("src/mock.ts"), true);
  assert.equal(isTestFile("src/sample.mock.ts"), true);

  // Non-test files should NOT be classified as test files
  assert.equal(isTestFile("src/App.tsx"), false);
  assert.equal(isTestFile("src/styles.css"), false);
  assert.equal(isTestFile("src/utils/types.ts"), false);
  assert.equal(isTestFile("src-tauri/src/session.rs"), false);
  assert.equal(isTestFile("src-tauri/src/codex_router.rs"), false);
  assert.equal(isTestFile("src-tauri/build.rs"), false);
});

test("countFileLines handles single lines, multiple lines, and CRLF / LF consistently", () => {
  assert.equal(countFileLines(""), 0);
  assert.equal(countFileLines(null), 0);
  assert.equal(countFileLines(undefined), 0);

  // Single line
  assert.equal(countFileLines("hello"), 1);
  assert.equal(countFileLines("hello\n"), 1);
  assert.equal(countFileLines("hello\r\n"), 1);

  // Two lines
  assert.equal(countFileLines("hello\nworld"), 2);
  assert.equal(countFileLines("hello\nworld\n"), 2);
  assert.equal(countFileLines("hello\r\nworld\r\n"), 2);

  // Multiple lines with intentional blank line at end
  assert.equal(countFileLines("hello\nworld\n\n"), 3);
  assert.equal(countFileLines("hello\r\nworld\r\n\r\n"), 3);
});

test("verifyLoc accurately evaluates file limits and ignores test files", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  // Verify on small compliant files
  const compliantCheck = verifyLoc({
    rootDir: root,
    files: [
      "src-tauri/build.rs",
      "src/utils/account-last-used.ts",
      "tests/check-loc.test.ts", // test file with tracked extension, should be skipped
    ],
  });

  assert.equal(compliantCheck.testFilesSkipped, 1, "test file should be skipped");
  assert.equal(compliantCheck.totalChecked, 2, "2 non-test files should be checked");
  assert.equal(compliantCheck.violations.length, 0, "compliant files should have 0 violations");
  assert.equal(compliantCheck.passed, true);
});

test("verifyLoc flags files exceeding LOC limit and computes excess correctly", () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  // Check with artificially low limits to test violation logic
  const customLimits = {
    ".rs": 2, // build.rs has 4 lines, will violate this custom limit
  };

  const check = verifyLoc({
    rootDir: root,
    limits: customLimits,
    files: ["src-tauri/build.rs"],
  });

  assert.equal(check.totalChecked, 1);
  assert.equal(check.violations.length, 1);
  assert.equal(check.passed, false);

  const violation = check.violations[0];
  assert.equal(violation.file, "src-tauri/build.rs");
  assert.equal(violation.limit, 2);
  assert.equal(violation.loc, 3); // 3 lines of code in build.rs (or 4 if blank)
  assert.equal(violation.excess, violation.loc - violation.limit);
});

test("IGNORED_DIRS includes standard build and dependency directories", () => {
  assert.equal(IGNORED_DIRS.has("node_modules"), true);
  assert.equal(IGNORED_DIRS.has(".git"), true);
  assert.equal(IGNORED_DIRS.has("target"), true);
  assert.equal(IGNORED_DIRS.has("dist"), true);
  assert.equal(IGNORED_DIRS.has(".test-build"), true);
  assert.equal(IGNORED_DIRS.has("gen"), true);
});

test("scanDirectory traverses directories and ignores build dirs", async () => {
  const { scanDirectory } = await import("../scripts/check-loc.mjs");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = scanDirectory(root, root);
  assert.ok(result.files.length > 0);
  assert.ok(result.testFilesSkipped >= 0);

  // Non-existent directory returns accumulator safely
  const empty = scanDirectory("/non-existent-dir-12345");
  assert.deepEqual(empty, { files: [], testFilesSkipped: 0 });
});

test("check-loc.mjs CLI runs with --warn, --json, and --max-violations flags", async () => {
  const { spawnSync } = await import("node:child_process");
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

  // Test --warn
  const warnRun = spawnSync(process.execPath, ["scripts/check-loc.mjs", "--warn"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(warnRun.status, 0);
  assert.ok((warnRun.stderr + warnRun.stdout).includes("Warning mode active"));

  // Test --json
  const jsonRun = spawnSync(process.execPath, ["scripts/check-loc.mjs", "--json", "--warn"], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(jsonRun.status, 0);
  const parsed = JSON.parse(jsonRun.stdout);
  assert.equal(typeof parsed.totalChecked, "number");

  // Test --max-violations
  const maxViolationsRun = spawnSync(
    process.execPath,
    ["scripts/check-loc.mjs", "--max-violations", "1000"],
    {
      cwd: root,
      encoding: "utf8",
    }
  );
  assert.equal(maxViolationsRun.status, 0);
  assert.ok(maxViolationsRun.stdout.includes("Allowed by --max-violations threshold"));
});
