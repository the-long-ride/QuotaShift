import test from "node:test";
import assert from "node:assert/strict";
import { parseCoverageOutput } from "../scripts/check-coverage.mjs";

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
  assert.equal(fileReports[0].lineCover, 100.0);
  assert.equal(fileReports[1].name, "crypto.js");
  assert.equal(fileReports[1].lineCover, 90.5);

  assert.ok(allFilesReport);
  assert.equal(allFilesReport.name, "all files");
  assert.equal(allFilesReport.lineCover, 95.25);
  assert.equal(allFilesReport.branchCover, 88.44);
  assert.equal(allFilesReport.funcsCover, 92.5);
});
