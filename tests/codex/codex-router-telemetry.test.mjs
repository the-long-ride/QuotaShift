import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const logsSrc = readFileSync("src/components/codex/router-server/CodexRouterServerLogs.tsx", "utf8");
const modalSrc = readFileSync("src/components/codex/telemetry/CodexRouterTelemetryModal.tsx", "utf8");
const chartSrc = readFileSync("src/components/codex/telemetry/CodexRouterTelemetryChart.tsx", "utf8");
const typesSrc = readFileSync("src/components/codex/telemetry/codexTelemetryTypes.ts", "utf8");
const serverCss = readFileSync("src/styles/codex/codex-router-server.css", "utf8");

test("Server logs header includes telemetry button and divider before All/Errors/Copy/Clear buttons", () => {
  const telemetryIdx = logsSrc.indexOf('aria-label="Token usage telemetry"');
  const dividerIdx = logsSrc.indexOf('className="qs-router-server-divider"');
  const allBtnIdx = logsSrc.indexOf('aria-label="All logs"');
  assert.ok(telemetryIdx > 0, "Telemetry trigger button must exist");
  assert.ok(dividerIdx > telemetryIdx, "Divider must appear after telemetry button");
  assert.ok(allBtnIdx > dividerIdx, "All logs button must appear after divider");
  assert.match(logsSrc, /<CodexRouterTelemetryModal/);
  assert.match(serverCss, /\.qs-router-server-divider\s*\{/);
});



test("Telemetry modal supports 24h, 7d, 30d, 90d, and all-time ranges, cache hits, and per-model breakdown", () => {
  for (const id of ["24h", "7d", "30d", "90d", "all"]) {
    assert.ok(typesSrc.includes(`"${id}"`), `Range ${id} must be defined`);
  }
  assert.match(modalSrc, /get_codex_router_telemetry/);
  assert.match(modalSrc, /Cached Hit Tokens/);
  assert.match(modalSrc, /Cache Hit Rate/);
  assert.match(modalSrc, /Per-Model Usage Breakdown/);
  assert.match(chartSrc, /Token Usage Over Time/);
  assert.match(chartSrc, /Prompt Cache Hit Rate/);
});

test("Telemetry modal is responsive and preserves window titlebar", () => {
  const telemetryCss = readFileSync("src/styles/codex/codex-router-telemetry.css", "utf8");
  const baseCss = readFileSync("src/styles/shared/base.css", "utf8");

  assert.match(modalSrc, /dialog-overlay qs-telemetry-backdrop/);
  assert.match(telemetryCss, /top:\s*38px;/);
  assert.match(telemetryCss, /height:\s*calc\(100% - 38px\);/);
  assert.match(telemetryCss, /width:\s*min\(1080px,/);
  assert.match(telemetryCss, /height:\s*min\(780px,/);
  assert.match(baseCss, /body:has\(\.dialog-overlay\)\s*\.app-header/);
});


