import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  resolveAccountTier,
  getAvailableTiers,
  getTierCounts,
} from "../../.test-build/cli-pools/tier-filter.js";

test("tier-filter correctly classifies and sorts Antigravity accounts", () => {
  const accounts = [
    { id: "1", lastPlan: "pro-tier" },
    { id: "2", lastPlan: "free" },
    { id: "3", lastPlan: "ultra-tier" },
    { id: "4", lastPlan: "plus" },
    { id: "5", lastPlan: "pro" },
  ];

  assert.equal(resolveAccountTier("agy", accounts[0]), "PRO");
  assert.equal(resolveAccountTier("agy", accounts[1]), "FREE");
  assert.equal(resolveAccountTier("agy", accounts[2]), "ULTRA");
  assert.equal(resolveAccountTier("agy", accounts[3]), "PLUS");

  const available = getAvailableTiers("agy", accounts);
  assert.deepEqual(available, ["FREE", "PLUS", "PRO", "ULTRA"]);

  const counts = getTierCounts("agy", accounts);
  assert.deepEqual(counts, { FREE: 1, PLUS: 1, PRO: 2, ULTRA: 1 });
});

test("tier-filter correctly classifies and sorts Codex accounts", () => {
  const accounts = [
    { id: "1", lastPlan: "ChatGPT Plus", isOAuth: true },
    { id: "2", lastPlan: "ChatGPT Pro", isOAuth: true },
    { id: "3", lastPlan: "free", isOAuth: true },
    { id: "4", lastPlan: "pay-as-you-go", isOAuth: false },
  ];

  assert.equal(resolveAccountTier("codex", accounts[0]), "PLUS");
  assert.equal(resolveAccountTier("codex", accounts[1]), "PRO");
  assert.equal(resolveAccountTier("codex", accounts[2]), "FREE");
  assert.equal(resolveAccountTier("codex", accounts[3]), "API");

  const available = getAvailableTiers("codex", accounts);
  assert.deepEqual(available, ["FREE", "PLUS", "PRO", "API"]);

  const counts = getTierCounts("codex", accounts);
  assert.deepEqual(counts, { FREE: 1, PLUS: 1, PRO: 1, API: 1 });
});

test("CliPoolEditor and subcomponents use CommonSwitch and no checkboxes", () => {
  const editorCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolEditor.tsx"),
    "utf8",
  );
  const accountListCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolAccountList.tsx"),
    "utf8",
  );
  const accountItemCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolAccountItem.tsx"),
    "utf8",
  );
  const filtersCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolFilters.tsx"),
    "utf8",
  );

  // Must not contain native checkbox inputs
  assert.ok(
    !editorCode.includes('type="checkbox"'),
    "CliPoolEditor must not contain type='checkbox'",
  );
  assert.ok(
    !accountListCode.includes('type="checkbox"'),
    "CliPoolAccountList must not contain type='checkbox'",
  );
  assert.ok(
    !accountItemCode.includes('type="checkbox"'),
    "CliPoolAccountItem must not contain type='checkbox'",
  );
  assert.ok(
    !filtersCode.includes('type="checkbox"'),
    "CliPoolFilters must not contain type='checkbox'",
  );

  // Must import and use CommonSwitch
  assert.ok(
    editorCode.includes("CommonSwitch"),
    "CliPoolEditor must use CommonSwitch",
  );
  assert.ok(
    accountItemCode.includes("CommonSwitch"),
    "CliPoolAccountItem must use CommonSwitch",
  );
  assert.ok(
    filtersCode.includes("CommonSwitch"),
    "CliPoolFilters must use CommonSwitch",
  );
});

test("CliPoolModal uses AccountModalLayout and app dialog classes", () => {
  const modalCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolModal.tsx"),
    "utf8",
  );

  assert.ok(
    modalCode.includes("AccountModalLayout"),
    "CliPoolModal must use AccountModalLayout",
  );
  assert.ok(
    modalCode.includes("dialog-box--cli-pool"),
    "CliPoolModal must specify dialog-box--cli-pool class",
  );
  assert.ok(
    modalCode.includes("dialog-btn"),
    "CliPoolModal must use app dialog-btn classes",
  );
});

test("Account search and tier filter elements are present in CliPoolFilters", () => {
  const filtersCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolFilters.tsx"),
    "utf8",
  );

  assert.ok(
    filtersCode.includes("cli-pool-search-input"),
    "CliPoolFilters must render search input",
  );
  assert.ok(
    filtersCode.includes("Filter by Tier"),
    "CliPoolFilters must render Filter by Tier label",
  );
  assert.ok(
    filtersCode.includes("cli-pool-tier-switch-list"),
    "CliPoolFilters must render tier switch list",
  );
});

test("CliPoolEditor orders Rotation & Automation Behavior switches: Enable -> AutoSwitch -> Fallback -> IdleOnly", () => {
  const editorCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolEditor.tsx"),
    "utf8",
  );

  const idxEnable = editorCode.indexOf("Enable this pool");
  const idxAutoSwitch = editorCode.indexOf("Automatic Quota Switching");
  const idxFallback = editorCode.indexOf("Allow Fallback to Latest Session");
  const idxIdle = editorCode.indexOf("Switch Only When Process Is Idle");

  assert.ok(idxEnable !== -1, "Enable this pool must exist");
  assert.ok(idxAutoSwitch !== -1, "Automatic Quota Switching must exist");
  assert.ok(idxFallback !== -1, "Allow Fallback to Latest Session must exist");
  assert.ok(idxIdle !== -1, "Switch Only When Process Is Idle must exist");

  assert.ok(idxEnable < idxAutoSwitch, "Enable this pool (1) must precede Automatic Quota Switching (2)");
  assert.ok(idxAutoSwitch < idxFallback, "Automatic Quota Switching (2) must precede Allow Fallback (3)");
  assert.ok(idxFallback < idxIdle, "Allow Fallback (3) must precede Switch Only When Process Is Idle (4)");
});

test("CliPoolModal integrates pool name search, active/unactive status filters, and card enable/disable switch", () => {
  const modalCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolModal.tsx"),
    "utf8"
  );
  const cardCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolCardItem.tsx"),
    "utf8"
  );
  const filterBarCode = fs.readFileSync(
    path.resolve("src/components/common/cli-pools/CliPoolSearchFilterBar.tsx"),
    "utf8"
  );

  assert.ok(modalCode.includes("CliPoolSearchFilterBar"), "CliPoolModal must mount CliPoolSearchFilterBar");
  assert.ok(modalCode.includes("searchQuery"), "CliPoolModal must maintain search state");
  assert.ok(modalCode.includes("statusFilter"), "CliPoolModal must maintain status filter state");
  assert.ok(filterBarCode.includes("Search pool name"), "CliPoolSearchFilterBar must render search input");
  assert.ok(filterBarCode.includes("Active ("), "CliPoolSearchFilterBar must render Active filter option");
  assert.ok(filterBarCode.includes("Unactive ("), "CliPoolSearchFilterBar must render Unactive filter option");

  assert.ok(cardCode.includes("CommonSwitch"), "CliPoolCardItem must render CommonSwitch");
  assert.ok(cardCode.includes("onToggleEnabled"), "CliPoolCardItem must handle pool enable/disable");
  assert.ok(
    cardCode.indexOf("CommonSwitch") < cardCode.indexOf("CliEditIcon"),
    "CommonSwitch must be on the left side of control action buttons"
  );
});
