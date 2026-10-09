import test from "node:test";
import assert from "node:assert/strict";

import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const require = createRequire(import.meta.url);
const modules = new Map();
function load(relative) {
  const path = resolve(relative);
  if (modules.has(path)) return modules.get(path).exports;
  const module = { exports: {} };
  modules.set(path, module);
  const source = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const localRequire = (specifier) => {
    if (!specifier.startsWith(".")) return require(specifier);
    const base = resolve(dirname(path), specifier).replace(/\.js$/, "");
    const candidate = [base + ".ts", base + ".tsx"].find(existsSync);
    return candidate ? load(candidate) : require(specifier);
  };
  new Function("require", "module", "exports", source)(localRequire, module, module.exports);
  return module.exports;
}
const { buildTaskbarColumns } = load("src/utils/common/taskbar-columns.ts");
const { buildAntigravityOverlayRows } = load("src/utils/common/app-overlay-quota-builders.ts");
const { AntigravityQuotaRows } = load("src/components/antigravity/AntigravityQuotaRows.tsx");
const { OverlayCard } = load("src/components/overlay/OverlayCard.tsx");
const { resolveAntigravityCardDisplay } = load(
  "src/components/antigravity/antigravity-card-helpers.ts",
);

const gemini = {
  family: "gemini",
  modelId: "gemini_pool",
  displayName: "Gemini Models",
  fiveHourPercent: 80,
  weeklyPercent: 40,
};
test("Gemini-only taskbar has two window lines without family icons or headings", () => {
  const rows = buildAntigravityOverlayRows([gemini]);
  const [column] = buildTaskbarColumns({ provider: "antigravity", label: "Test", quotaRows: rows });
  assert.deepEqual(
    column.lines.map((l) => [l.label, l.icon, l.values]),
    [
      ["5H", null, [80]],
      ["WK", null, [40]],
    ],
  );
  assert.equal(column.details.sections[0].title, null);
  assert.equal(column.details.sections[0].icon, null);
});
test("overlay aggregates per-model pool values instead of selecting the first model", () => {
  const rows = buildAntigravityOverlayRows([
    gemini,
    { ...gemini, modelId: "gemini-flash", fiveHourPercent: 20 },
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fiveHourPercent, 20);
});

test("Gemini-only account card uses two Codex-style limits without model headers", () => {
  const markup = renderToStaticMarkup(
    React.createElement(AntigravityQuotaRows, {
      quotas: [{ model: "Gemini Models", fiveHourPercent: 80, weeklyPercent: 40 }],
    }),
  );
  assert.ok(!markup.includes("quota-item-header"));
  assert.ok(!markup.includes("Gemini"));
  assert.equal((markup.match(/class="quota-limit-col"/g) || []).length, 2);
  assert.ok(markup.includes("grid-template-columns:repeat(2, 1fr)"));
});
test("Gemini-only overlay has two bars without Gemini icon or wide layout", () => {
  const data = {
    provider: "antigravity",
    label: "Test",
    quotaRows: buildAntigravityOverlayRows([gemini]),
  };
  const markup = renderToStaticMarkup(
    React.createElement(OverlayCard, {
      data,
      avatarError: false,
      setAvatarError: () => {},
      showTooltip: false,
      tooltipText: null,
    }),
  );
  assert.ok(!markup.includes("overlay-family-logo"));
  assert.ok(!markup.includes("glass-card--wide"));
  assert.equal((markup.match(/class="overlay-progress-track"/g) || []).length, 2);
});
test("successful cloud response replaces obsolete exact quotas; errors retain cached quota", () => {
  const old = [{ model: "Claude & OpenAI Models", fiveHourPercent: 10 }];
  const account = { id: "test", quotas: old };
  assert.deepEqual(
    resolveAntigravityCardDisplay(account, {
      cloudQuotas: [gemini],
      quotas: old,
    }).displayQuotas.map((q) => q.model),
    ["Gemini Models"],
  );
  assert.deepEqual(
    resolveAntigravityCardDisplay(account, { cloudQuotas: [], quotas: old }).displayQuotas,
    [],
  );
  assert.deepEqual(
    resolveAntigravityCardDisplay(account, { error: "offline", quotas: old }).displayQuotas,
    old,
  );
});

test("grouped cloud summary also checks model availability before aggregation", () => {
  const source = readFileSync("src-tauri/src/antigravity/usage.rs", "utf8");
  const branch = source.slice(
    source.indexOf("if let Some(summary)"),
    source.indexOf("let (primary_quotas"),
  );
  assert.match(
    branch,
    /aggregate_antigravity_quotas\(\s*models_response\.as_ref\(\),\s*Some\(&summary\)/,
  );
});

test("both available pools keep family headings and icons across displays", () => {
  const quotas = [
    { model: "Gemini Models", fiveHourPercent: 80, weeklyPercent: 40 },
    { model: "Claude & OpenAI Models", fiveHourPercent: 60, weeklyPercent: 30 },
  ];
  const markup = renderToStaticMarkup(React.createElement(AntigravityQuotaRows, { quotas }));
  assert.equal((markup.match(/class="quota-item-header"/g) || []).length, 2);
  const rows = buildAntigravityOverlayRows([
    gemini,
    { ...gemini, modelId: "claude_pool", displayName: "Claude & OpenAI Models", family: "claude" },
  ]);
  const [column] = buildTaskbarColumns({ provider: "antigravity", label: "Test", quotaRows: rows });
  assert.deepEqual(
    column.lines.map((line) => line.icon),
    ["gemini", "claude-openai"],
  );
  const overlay = renderToStaticMarkup(
    React.createElement(OverlayCard, {
      data: { provider: "antigravity", label: "Test", quotaRows: rows },
      avatarError: false,
      setAvatarError: () => {},
      showTooltip: false,
    }),
  );
  assert.ok(overlay.includes("glass-card--wide"));
  assert.equal((overlay.match(/class="overlay-family-logo"/g) || []).length, 2);
});
test("local exact Gemini pool preserves missing weekly values and disabled resets", () => {
  const rows = buildAntigravityOverlayRows([
    {
      model: "Gemini Models",
      fiveHourPercent: 0,
      fiveHourDisabled: true,
      fiveHourReset: "2026-10-10T00:00:00Z",
    },
  ]);
  assert.equal(rows[0].weeklyPercent, null);
  assert.equal(rows[0].fiveHourDisabled, true);
  assert.equal(rows[0].fiveHourResetAt, "2026-10-10T00:00:00Z");
});

test("saved cloud pools remain authoritative after restarting without an in-memory cache", () => {
  const old = [{ model: "Claude & OpenAI Models", fiveHourPercent: 10 }];
  assert.deepEqual(
    resolveAntigravityCardDisplay({
      id: "test",
      quotas: old,
      cloudQuotas: [gemini],
    }).displayQuotas.map((q) => q.model),
    ["Gemini Models"],
  );
  assert.deepEqual(
    resolveAntigravityCardDisplay({ id: "test", quotas: old, cloudQuotas: [] }).displayQuotas,
    [],
  );
});
