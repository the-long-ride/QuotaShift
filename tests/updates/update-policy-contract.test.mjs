import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readWithCssImports } from "../css-helper.mjs";

const app = readWithCssImports("src/App.tsx");
const policy = fs.readFileSync("src/utils/common/update-policy.ts", "utf8");

test("update action opens the fixed official release page for manual download", () => {
  assert.match(app, /OFFICIAL_RELEASE_URL/);
  assert.match(app, /openUrl\(OFFICIAL_RELEASE_URL\)/);
  assert.doesNotMatch(app, /execute_update/);
  assert.doesNotMatch(app, /updateDownloadUrl/);
});

test("update detection preserves newer-version reporting without selecting an asset", () => {
  assert.match(app, /setUpdateAvailable\(true\)/);
  assert.match(app, /setUpdateTag\(latestTag\)/);
  assert.doesNotMatch(app, /releaseData\.assets/);
  assert.doesNotMatch(app, /browser_download_url/);
  assert.doesNotMatch(app, /navigator\.userAgent/);
});

test("the update opener is restricted to the HTTPS QuotaShift release page", () => {
  assert.match(
    policy,
    /const OFFICIAL_RELEASE_URL = "https:\/\/github\.com\/the-long-ride\/QuotaShift\/releases\/latest"/
  );
  assert.doesNotMatch(app, /openUrl\([^)]*releaseData/);
  assert.doesNotMatch(app, /openUrl\([^)]*browser_download_url/);
});

test("download new version button triggers backup recommendation dialog with I'll backup now and Download new version", () => {
  assert.match(app, /setUpdatePromptOpen\(true\)/);
  assert.match(app, /cancelText="I'll backup now"/);
  assert.match(app, /confirmText="Download new version"/);
  assert.match(app, /handleExportBackup\(\)/);
  assert.match(app, /openUrl\(OFFICIAL_RELEASE_URL\)/);
});

