import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const policy = fs.readFileSync("src/utils/common/update-policy.ts", "utf8");

test("update action opens the fixed official release page for manual download", () => {
  assert.match(app, /OFFICIAL_RELEASE_URL/);
  assert.match(app, /openUrl\(OFFICIAL_RELEASE_URL\)/);
  assert.match(app, /manual download/i);
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
