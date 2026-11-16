import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("NSIS uninstaller shows clean-all-data checkbox with credential backup hint and wipes all QuotaShift data", () => {
  const nsi = readFileSync("src-tauri/installer.nsi", "utf8");

  assert.match(nsi, /Var DeleteAppDataCheckbox/);
  assert.match(nsi, /Var DeleteAppDataHint/);
  assert.match(nsi, /Clean all app data \(includes temp files and all data written to this device\)/);
  assert.match(
    nsi,
    /Back up your accounts and credentials in QuotaShift \(Settings > Data\) before uninstalling/,
  );

  // Full device cleanup when checked and not updating
  assert.match(nsi, /RmDir \/r "\$APPDATA\\\$\{BUNDLEID\}"/);
  assert.match(nsi, /RmDir \/r "\$LOCALAPPDATA\\\$\{BUNDLEID\}"/);
  assert.match(nsi, /RmDir \/r "\$APPDATA\\\$\{PRODUCTNAME\}"/);
  assert.match(nsi, /RmDir \/r "\$LOCALAPPDATA\\\$\{PRODUCTNAME\}"/);
  assert.match(nsi, /RmDir \/r "\$PROFILE\\\.quotashift"/);
  assert.match(nsi, /RmDir \/r "\$TEMP\\quotashift-agent-setup"/);
  assert.match(nsi, /Delete "\$TEMP\\quotashift\*"/);
  assert.match(nsi, /Delete "\$TEMP\\qs-inject-\*\.txt"/);
  assert.match(nsi, /CredDeleteW.*secure-storage-key-v1\.com\.the-long-ride\.quotashift/);
  assert.match(nsi, /CredDeleteW.*agent-api-key-v1\.com\.the-long-ride\.quotashift\.agent-api/);
  assert.match(nsi, /DeleteRegValue HKCU "Environment" "QUOTASHIFT_AGENT_API_URL"/);
  assert.match(nsi, /DeleteRegValue HKCU "Environment" "QUOTASHIFT_AGENT_API_KEY"/);
  assert.match(nsi, /un\.RemoveManagedAgentSkill/);
  assert.match(nsi, /\$\{UnStrLoc\}/);
});
