import { spawnSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync } from "node:fs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function parseCoverageOutput(output) {
  const lines = output.split(/\r?\n/);
  const fileReports = [];
  let allFilesReport = null;

  for (const line of lines) {
    // Match line format: ℹ  filename.js | 100.00 | 100.00 | 100.00 | ...
    const match = line.match(/^ℹ\s+(.+?)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)\s+\|/);
    if (match) {
      const name = match[1].trim();
      const lineCover = parseFloat(match[2]);
      const branchCover = parseFloat(match[3]);
      const funcsCover = parseFloat(match[4]);

      const record = {
        name,
        lineCover,
        branchCover,
        funcsCover,
      };

      if (name === "all files") {
        allFilesReport = record;
      } else {
        fileReports.push(record);
      }
    }
  }

  return { fileReports, allFilesReport };
}

export function runCoverageGate(minThreshold = 85) {
  console.log("======================================================================");
  console.log("               Code Coverage Verification Gate (>= 85%)               ");
  console.log("======================================================================");
  console.log(`Enforcing minimum coverage: ${minThreshold}%\n`);

  // First ensure tests are compiled
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

  // Get test files
  const testFiles = readdirSync(join(root, "tests"))
    .filter((name) => name.endsWith(".test.mjs"))
    .map((name) => join("tests", name));

  // Run with coverage
  const covResult = spawnSync(
    process.execPath,
    ["--experimental-test-coverage", "--test", ...testFiles],
    {
      cwd: root,
      encoding: "utf8",
      stdio: "pipe",
    }
  );

  const combinedOutput = (covResult.stdout || "") + "\n" + (covResult.stderr || "");
  const { fileReports, allFilesReport } = parseCoverageOutput(combinedOutput);

  // Print raw coverage table from node
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
  console.log(`Overall Line Coverage:    ${allFilesReport.lineCover.toFixed(2)}% (Target: >= ${minThreshold}%)`);
  console.log(`Overall Branch Coverage:  ${allFilesReport.branchCover.toFixed(2)}%`);
  console.log(`Overall Function Coverage:${allFilesReport.funcsCover.toFixed(2)}%`);
  console.log("----------------------------------------------------------------------");

  if (allFilesReport.lineCover < minThreshold) {
    console.error(`\nFAILED: Line coverage ${allFilesReport.lineCover}% is below required ${minThreshold}% threshold.`);
    process.exit(1);
  } else {
    console.log(`\nPASSED: Code coverage ${allFilesReport.lineCover}% meets gate requirement (>= ${minThreshold}%).`);
    process.exit(0);
  }
}

const isDirect = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isDirect) {
  const thresholdArg = process.argv.indexOf("--threshold");
  const threshold = thresholdArg !== -1 ? parseFloat(process.argv[thresholdArg + 1]) : 85;
  runCoverageGate(threshold);
}
