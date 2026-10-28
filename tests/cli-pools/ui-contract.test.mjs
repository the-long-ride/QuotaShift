import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("CodexTab labels existing model pools subtab as Model Pools", () => {
  const codexTabContent = fs.readFileSync(
    path.resolve("src/components/codex/CodexTab.tsx"),
    "utf8",
  );
  assert.ok(
    codexTabContent.includes("Model Pools"),
    "CodexTab must label the subtab as 'Model Pools' instead of plain 'Pools'",
  );
});

test("AntigravityTab contains CLI Pools button", () => {
  const agyTabContent = fs.readFileSync(
    path.resolve("src/components/antigravity/AntigravityTab.tsx"),
    "utf8",
  );
  assert.ok(
    agyTabContent.includes("CLI Pools"),
    "AntigravityTab must contain a 'CLI Pools' button",
  );
  assert.ok(agyTabContent.includes("CliPoolModal"), "AntigravityTab must mount CliPoolModal");
});

test("CodexAccountBar contains CLI Pools button", () => {
  const barContent = fs.readFileSync(
    path.resolve("src/components/codex/cards/CodexAccountBar.tsx"),
    "utf8",
  );
  assert.ok(barContent.includes("CLI Pools"), "CodexAccountBar must contain a 'CLI Pools' button");
});

test("CliPoolModal and CliPoolEditor components exist", () => {
  assert.ok(
    fs.existsSync(path.resolve("src/components/common/cli-pools/CliPoolModal.tsx")),
    "CliPoolModal.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.resolve("src/components/common/cli-pools/CliPoolEditor.tsx")),
    "CliPoolEditor.tsx must exist",
  );
  assert.ok(
    fs.existsSync(path.resolve("src/styles/common/cli-pools.css")),
    "cli-pools.css must exist",
  );
});
