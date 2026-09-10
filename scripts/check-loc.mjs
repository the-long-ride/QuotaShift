import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, extname } from "node:path";
import { fileURLToPath } from "node:url";

export const DEFAULT_LIMITS = {
  ".tsx": 350,
  ".ts": 300,
  ".rs": 300,
  ".css": 600,
};

export const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".test-build",
  "target",
  "gen",
  "release",
  ".vscode",
  ".agents",
  ".gemini",
  "assets",
  "public",
]);

/**
 * Checks if a relative or absolute file path is classified as a test file.
 * Test files are excluded from LOC verification.
 */
export function isTestFile(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const base = parts[parts.length - 1];

  // Directory-level exclusion (e.g. tests/, __tests__/, fixtures/)
  for (const part of parts.slice(0, -1)) {
    if (/^(tests?|__tests__|fixtures|test-fixtures)$/i.test(part)) {
      return true;
    }
  }

  // Filename patterns:
  // *.test.* or *.spec.*
  if (/\.(test|spec)\.[a-z0-9]+$/i.test(base)) {
    return true;
  }

  // Rust test file conventions: test_*.rs, *_test.rs, tests.rs
  if (/^test_.*\.rs$/i.test(base) || /.*_test\.rs$/i.test(base) || base.toLowerCase() === "tests.rs") {
    return true;
  }

  // Mock and fixture files
  if (/(^|[._-])(mock|fixture)($|[._-])/i.test(base)) {
    return true;
  }

  return false;
}

/**
 * Counts POSIX lines of code in a file content string.
 * Strips a single trailing newline so EOF line break does not inflate count.
 */
export function countFileLines(content) {
  if (!content || content.length === 0) return 0;
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines.length;
}

/**
 * Recursively scans directory for tracked source files, ignoring build/cache dirs.
 */
export function scanDirectory(dir, rootDir = dir, acc = { files: [], testFilesSkipped: 0 }) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry)) continue;

    const fullPath = resolve(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      scanDirectory(fullPath, rootDir, acc);
    } else if (stat.isFile()) {
      const relPath = fullPath.slice(rootDir.length + 1).replace(/\\/g, "/");
      const ext = extname(entry);

      if (Object.prototype.hasOwnProperty.call(DEFAULT_LIMITS, ext)) {
        if (isTestFile(relPath)) {
          acc.testFilesSkipped++;
        } else {
          acc.files.push({
            relPath,
            fullPath,
            ext,
            limit: DEFAULT_LIMITS[ext],
          });
        }
      }
    }
  }

  return acc;
}

/**
 * Verifies LOC for all tracked files or provided list.
 */
export function verifyLoc(options = {}) {
  const root = options.rootDir || resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const limits = options.limits || DEFAULT_LIMITS;

  let targetFiles;
  let skippedTests = 0;

  if (Array.isArray(options.files) && options.files.length > 0) {
    targetFiles = [];
    for (const file of options.files) {
      const fullPath = resolve(root, file);
      const relPath = fullPath.slice(root.length + 1).replace(/\\/g, "/");
      const ext = extname(file);
      if (Object.prototype.hasOwnProperty.call(limits, ext)) {
        if (isTestFile(relPath)) {
          skippedTests++;
        } else {
          targetFiles.push({
            relPath,
            fullPath,
            ext,
            limit: limits[ext],
          });
        }
      }
    }
  } else {
    const scan = scanDirectory(root, root);
    targetFiles = scan.files;
    skippedTests = scan.testFilesSkipped;
  }

  const results = [];
  const violations = [];

  for (const file of targetFiles) {
    let content = "";
    try {
      content = readFileSync(file.fullPath, "utf8");
    } catch (err) {
      results.push({
        ...file,
        loc: 0,
        error: String(err),
        passed: false,
      });
      violations.push(results[results.length - 1]);
      continue;
    }

    const loc = countFileLines(content);
    const passed = loc <= file.limit;
    const record = {
      file: file.relPath,
      ext: file.ext,
      loc,
      limit: file.limit,
      excess: Math.max(0, loc - file.limit),
      passed,
    };

    results.push(record);
    if (!passed) {
      violations.push(record);
    }
  }

  // Sort violations by excess lines descending
  violations.sort((a, b) => b.excess - a.excess);

  return {
    totalChecked: results.length,
    totalPassed: results.length - violations.length,
    testFilesSkipped: skippedTests,
    violations,
    passed: violations.length === 0,
    results,
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const warnOnly = args.includes("--warn");
  const jsonOutput = args.includes("--json");
  const maxViolationsArg = args.indexOf("--max-violations");
  const maxViolations = maxViolationsArg !== -1 ? parseInt(args[maxViolationsArg + 1], 10) : 0;

  const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const result = verifyLoc({ rootDir: root });

  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
    if (!warnOnly && result.violations.length > maxViolations) {
      process.exit(1);
    }
    return;
  }

  console.log("======================================================================");
  console.log("                     LOC Limit Verification Gate                      ");
  console.log("======================================================================");
  console.log("Limits:");
  console.log("  .tsx : max 350 LOC");
  console.log("  .ts  : max 300 LOC");
  console.log("  .rs  : max 300 LOC");
  console.log("  .css : max 600 LOC");
  console.log("  (Test files excluded)\n");

  if (result.violations.length > 0) {
    console.error(`Found ${result.violations.length} file(s) exceeding LOC limits:\n`);
    const hFile = "File".padEnd(50);
    const hLoc = "LOC".padStart(6);
    const hLimit = "Limit".padStart(7);
    const hExcess = "Excess".padStart(8);
    console.error(`  ${hFile} ${hLoc} ${hLimit} ${hExcess}`);
    console.error("  %s", "-".repeat(75));

    for (const v of result.violations) {
      const fileCol = v.file.length > 50 ? "..." + v.file.slice(-47) : v.file.padEnd(50);
      const locCol = String(v.loc).padStart(6);
      const limitCol = String(v.limit).padStart(7);
      const excessCol = `+${v.excess}`.padStart(8);
      console.error(`  ${fileCol} ${locCol} ${limitCol} ${excessCol}`);
    }
    console.error("  %s\n", "-".repeat(75));
  }

  console.log(
    `Summary: ${result.totalPassed}/${result.totalChecked} files within limit. ` +
      `(${result.testFilesSkipped} test files skipped)`
  );

  if (maxViolations > 0 && result.violations.length <= maxViolations) {
    console.log(`\nAllowed by --max-violations threshold (${maxViolations}). Gate passing.`);
    process.exit(0);
  }

  if (warnOnly) {
    console.warn("\nWarning mode active (--warn). Exiting with code 0.");
    process.exit(0);
  }

  if (result.violations.length > 0) {
    console.error(`\nFAILED: ${result.violations.length} LOC violation(s) detected.`);
    process.exit(1);
  } else {
    console.log("\nPASSED: All files are within LOC limits.");
    process.exit(0);
  }
}

// Run CLI when invoked directly
const isDirectExecution = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirectExecution) {
  runCli();
}
