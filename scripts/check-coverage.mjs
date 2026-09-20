import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Measure every compiled production utility. Static exclusions are infrastructure only.
// Generated compatibility shims are excluded by the exact paths emitted by scripts/test.mjs.
// Never add src/** product paths here.
export const COVERAGE_INCLUDES = [".test-build/*.js", ".test-build/**/*.js"];
export const COVERAGE_INFRASTRUCTURE_EXCLUDES = [
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
];
export const COVERAGE_STATIC_EXCLUDES = [
  "tests/**",
  "scripts/**",
  ...COVERAGE_INFRASTRUCTURE_EXCLUDES,
];
export const COVERAGE_SHIM_MANIFEST = ".test-build/coverage-shims.json";

export function buildCoverageExcludes(generatedShims) {
  if (!Array.isArray(generatedShims)) {
    throw new Error("Coverage shim manifest must contain an array");
  }

  const exactShims = generatedShims.map((entry) => {
    if (typeof entry !== "string" || !/^\.test-build\/[^/]+\.js$/.test(entry)) {
      throw new Error(`Invalid generated coverage shim path: ${String(entry)}`);
    }
    return entry;
  });

  return [...COVERAGE_STATIC_EXCLUDES, ...new Set(exactShims)];
}
export const DEFAULT_COVERAGE_THRESHOLDS = {
  lines: 95,
  branches: 85,
  functions: 95,
};

export function parseCoverageOutput(output) {
  const lines = output.split(/\r?\n/);
  const fileReports = [];
  let allFilesReport = null;

  for (const line of lines) {
    const match = line.match(
      /^ℹ\s+(.+?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/,
    );
    if (!match) continue;

    const record = {
      name: match[1].trim(),
      lineCover: parseFloat(match[2]),
      branchCover: parseFloat(match[3]),
      funcsCover: parseFloat(match[4]),
    };
    if (record.name === "all files") allFilesReport = record;
    else fileReports.push(record);
  }

  return { fileReports, allFilesReport };
}

export function runCoverageGate(thresholds = DEFAULT_COVERAGE_THRESHOLDS) {
  const minimums =
    typeof thresholds === "number"
      ? { ...DEFAULT_COVERAGE_THRESHOLDS, lines: thresholds }
      : { ...DEFAULT_COVERAGE_THRESHOLDS, ...thresholds };

  console.log("======================================================================");
  console.log("                    Code Coverage Verification Gate                    ");
  console.log("======================================================================");
  console.log(
    `Enforcing minimum coverage: lines ${minimums.lines}%, branches ${minimums.branches}%, functions ${minimums.functions}%\n`,
  );

  const testScriptResult = spawnSync(process.execPath, ["scripts/test.mjs"], {
    cwd: root,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (testScriptResult.status !== 0) {
    console.error("Test build / execution failed:");
    console.error(testScriptResult.stderr || testScriptResult.stdout);
    process.exit(testScriptResult.status ?? 1);
  }

  const generatedShims = JSON.parse(
    readFileSync(join(root, COVERAGE_SHIM_MANIFEST), "utf8"),
  );
  const coverageExcludes = buildCoverageExcludes(generatedShims);

  const testFiles = readdirSync(join(root, "tests"))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name));

  const covResult = spawnSync(
    process.execPath,
    [
      "--experimental-test-coverage",
      ...COVERAGE_INCLUDES.map((pattern) => `--test-coverage-include=${pattern}`),
      ...coverageExcludes.map((pattern) => `--test-coverage-exclude=${pattern}`),
      "--test",
      ...testFiles,
    ],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    },
  );

  const combinedOutput = (covResult.stdout || "") + "\n" + (covResult.stderr || "");
  const { allFilesReport } = parseCoverageOutput(combinedOutput);

  const startIdx = combinedOutput.indexOf("start of coverage report");
  const endIdx = combinedOutput.indexOf("end of coverage report");
  if (startIdx !== -1 && endIdx !== -1) {
    console.log(combinedOutput.slice(startIdx, endIdx + "end of coverage report".length));
  } else {
    console.log(combinedOutput);
  }

  if (!allFilesReport) {
    console.error("\nFailed to extract overall coverage report.");
    process.exit(1);
  }

  console.log("\n----------------------------------------------------------------------");
  console.log(
    `Overall Line Coverage:    ${allFilesReport.lineCover.toFixed(2)}% (Target: >= ${minimums.lines}%)`,
  );
  console.log(
    `Overall Branch Coverage:  ${allFilesReport.branchCover.toFixed(2)}% (Target: >= ${minimums.branches}%)`,
  );
  console.log(
    `Overall Function Coverage:${allFilesReport.funcsCover.toFixed(2)}% (Target: >= ${minimums.functions}%)`,
  );
  console.log("----------------------------------------------------------------------");

  const failures = [
    ["Line", allFilesReport.lineCover, minimums.lines],
    ["Branch", allFilesReport.branchCover, minimums.branches],
    ["Function", allFilesReport.funcsCover, minimums.functions],
  ].filter(([, actual, minimum]) => actual < minimum);

  if (failures.length > 0) {
    for (const [name, actual, minimum] of failures) {
      console.error(`FAILED: ${name} coverage ${actual}% is below required ${minimum}% threshold.`);
    }
    process.exit(1);
  }

  console.log("\nPASSED: line, branch, and function coverage meet all gate requirements.");
  process.exit(0);
}

const isDirect =
  process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  const thresholdArg = process.argv.indexOf("--threshold");
  const lineThreshold =
    thresholdArg !== -1
      ? parseFloat(process.argv[thresholdArg + 1])
      : DEFAULT_COVERAGE_THRESHOLDS.lines;
  runCoverageGate({ ...DEFAULT_COVERAGE_THRESHOLDS, lines: lineThreshold });
}
