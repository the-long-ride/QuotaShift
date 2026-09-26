import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const installer = readFileSync("src-tauri/installer.nsi", "utf8");

test("installer creates desktop shortcut checkbox unchecked by default", () => {
  assert.match(
    installer,
    /!define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED/,
    "Desktop shortcut checkbox must be unchecked by default via MUI_FINISHPAGE_SHOWREADME_NOTCHECKED",
  );
  assert.match(
    installer,
    /!define MUI_FINISHPAGE_SHOWREADME_FUNCTION CreateOrUpdateDesktopShortcut/,
    "Desktop shortcut creation function must be hooked to showreadme",
  );
});

test("installer creates autostart on device start up checkbox checked by default", () => {
  assert.match(
    installer,
    /!define MUI_PAGE_CUSTOMFUNCTION_SHOW FinishShow/,
    "Finish page must register FinishShow callback",
  );
  assert.match(
    installer,
    /!define MUI_PAGE_CUSTOMFUNCTION_LEAVE FinishLeave/,
    "Finish page must register FinishLeave callback",
  );
  assert.match(
    installer,
    /Function FinishShow[\s\S]*?\${NSD_CreateCheckbox}[\s\S]*?Start \${PRODUCTNAME} when device starts up[\s\S]*?SendMessage \$AutoStartCheckbox \${BM_SETCHECK} \${BST_CHECKED}/,
    "Autostart checkbox must be created and checked by default",
  );
  assert.match(
    installer,
    /Function FinishLeave[\s\S]*?Call EnableAutoStart[\s\S]*?Call DisableAutoStart/,
    "FinishLeave must enable or disable autostart based on checkbox state",
  );
});

test("installer implements EnableAutoStart and DisableAutoStart with registry Run key", () => {
  assert.match(
    installer,
    /Function EnableAutoStart[\s\S]*?WriteRegStr SHCTX "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "\${PRODUCTNAME}"/,
    "EnableAutoStart must write app executable to Windows Run key",
  );
  assert.match(
    installer,
    /Function DisableAutoStart[\s\S]*?DeleteRegValue SHCTX "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "\${PRODUCTNAME}"/,
    "DisableAutoStart must remove entry from Windows Run key",
  );
});

test("installer cleans up autostart entry during uninstallation", () => {
  assert.match(
    installer,
    /DeleteRegValue HKCU "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "\${PRODUCTNAME}"/,
    "Uninstaller must clean up HKCU autostart Run entry",
  );
  assert.match(
    installer,
    /DeleteRegValue HKLM "Software\\Microsoft\\Windows\\CurrentVersion\\Run" "\${PRODUCTNAME}"/,
    "Uninstaller must clean up HKLM autostart Run entry",
  );
});
