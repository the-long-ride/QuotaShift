import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  observePoolQuota,
  recordQuotaEvidence,
  nextEligibleCandidate,
} from "../../.test-build/cli-pools/auto-failover.js";

const now = Date.parse("2026-11-12T15:00:00.000Z");
const ag = (remaining, fetchedAt = now, historical = false) => ({
  accuracy: "exact_grouped",
  fetchedAt,
  cloudQuotas: [
    {
      modelId: "claude",
      family: "claude",
      fiveHourPercent: remaining,
      weeklyPercent: remaining,
      quotaCarried: historical,
    },
  ],
});
const codex = (used, fetchedAt = now) => ({
  isOAuth: true,
  fetchedAt,
  primary: { used_percent: used, reset_at: Math.floor(now / 1000) + 7200 },
  secondary: { used_percent: 12, reset_at: Math.floor(now / 1000) + 20000 },
});
const pool = {
  id: "test",
  provider: "codex",
  enabled: true,
  autoSwitch: true,
  accountIds: ["a", "b", "c"],
  triggerWindows: ["5h", "weekly"],
  fallbackLatestEnabled: true,
  switchWhenIdleOnly: false,
};

test("Antigravity requires exact, fresh, uncarried quota and all model groups exhausted", () => {
  assert.equal(observePoolQuota("agy", ag(0), "5h", now)?.remaining, 0);
  assert.equal(observePoolQuota("agy", ag(0, now, true), "5h", now), null);
  assert.equal(observePoolQuota("agy", ag(0, now - 400000), "5h", now), null);
  assert.equal(observePoolQuota("agy", { ...ag(0), accuracy: "session_only" }, "5h", now), null);
  const mixed = {
    ...ag(0),
    cloudQuotas: [ag(0).cloudQuotas[0], { modelId: "gemini", fiveHourPercent: 70 }],
  };
  assert.equal(observePoolQuota("agy", mixed, "5h", now)?.remaining, 70);
});

test("Codex usage only rotates after fresh confirmed exhaustion, not transient failure", () => {
  const samples = new Map();
  const first = observePoolQuota("codex", codex(100), "5h", now);
  assert.equal(first?.remaining, 0);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", first, now, 2, 5), false);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", first, now, 2, 5), false);
  const secondAt = now + 30000;
  const second = observePoolQuota("codex", codex(100, secondAt), "5h", secondAt);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", second, secondAt, 2, 5), true);
  assert.equal(recordQuotaEvidence(samples, "codex:a:5h", second, secondAt, 2, 5), false);
  assert.equal(observePoolQuota("codex", { ...codex(100), error: "timeout" }, "5h", now), null);
});

test("recovery or reset epoch change must clear exhaustion evidence", () => {
  const history = new Map();
  const depleted = observePoolQuota("codex", codex(100), "5h", now);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", depleted, now, 2, 5), false);
  const recovered = observePoolQuota("codex", codex(40, now + 10000), "5h", now + 10000);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", recovered, now + 10000, 2, 5), false);
  const depletedAgain = observePoolQuota("codex", codex(100, now + 20000), "5h", now + 20000);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", depletedAgain, now + 20000, 2, 5), false);
});

test("candidate selection respects enabled pool ordering, availability and freshness", () => {
  const accounts = [
    { id: "a", provider: "codex", remainingPercent: 0, updatedAt: now },
    { id: "b", provider: "codex", remainingPercent: 80, updatedAt: now - 400000 },
    { id: "c", provider: "codex", remainingPercent: 20, updatedAt: now },
  ];
  assert.equal(nextEligibleCandidate(pool, "a", accounts, now), "c");
  assert.equal(nextEligibleCandidate(pool, "missing", accounts, now), null);
  assert.equal(nextEligibleCandidate({ ...pool, autoSwitch: false }, "a", accounts, now), null);
});

test("loading and duplicate renders cannot fabricate or erase quota evidence", () => {
  const history = new Map();
  const first = observePoolQuota("codex", codex(100), "5h", now);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", first, now), false);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", null, now + 1000), false);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", first, now + 2000), false);
  const next = observePoolQuota("codex", codex(100, now + 30000), "5h", now + 30000);
  assert.equal(recordQuotaEvidence(history, "codex:a:5h", next, now + 30000), true);
});
test("Codex secondary daily rate limit never masquerades as weekly", () => {
  const daily = {
    ...codex(100),
    secondary: { used_percent: 100, window_duration_mins: 1440, reset_at: now / 1000 + 86400 },
  };
  assert.equal(observePoolQuota("codex", daily, "weekly", now), null);
});

test("idle-only pools are not skipped in frontend preflight and delegate to native idle probe", () => {
  const hook = fs.readFileSync("src/hooks/app/useCliPoolAutoFailover.ts", "utf8");
  const guard = fs.readFileSync("src/hooks/app/cliPoolAutoPreflightGuard.ts", "utf8");
  const runtime = fs.readFileSync("src-tauri/src/cli_pools/runtime.rs", "utf8");

  assert.ok(!hook.includes("pool.switchWhenIdleOnly"), "hook must not skip switchWhenIdleOnly");
  assert.ok(
    !guard.includes("updatedPool.switchWhenIdleOnly"),
    "guard must not reject switchWhenIdleOnly",
  );
  assert.ok(
    runtime.includes("probe_cli_instance_idle"),
    "native runtime preflight must call probe_cli_instance_idle",
  );
});

test("post-switch continuation failure copies resume command and shows toast", () => {
  const hook = fs.readFileSync("src/hooks/app/useCliPoolAutoFailover.ts", "utf8");
  const restore = fs.readFileSync("src-tauri/src/system/cli_restore/restore.rs", "utf8");

  assert.ok(hook.includes("plan.commandSpec"), "hook must read plan.commandSpec");
  assert.ok(
    hook.includes("navigator.clipboard?.writeText"),
    "hook must best-effort copy resume command via navigator.clipboard?.writeText",
  );
  assert.ok(
    hook.includes("Switched account. Resume command copied to clipboard."),
    "hook must show clipboard fallback toast",
  );
  assert.ok(
    restore.includes("verify_cli_running") && restore.includes("Duration::from_millis(500)"),
    "restore must poll up to 2.5s (5x500ms) for running CLI process",
  );
});

test("multi-process plan_rotation disambiguates distinct cwds via recent session activity", () => {
  const controller = fs.readFileSync("src-tauri/src/cli_pools/controller/mod.rs", "utf8");
  const disambiguate = fs.readFileSync(
    "src-tauri/src/cli_pools/controller/disambiguate.rs",
    "utf8",
  );
  const idle = fs.readFileSync("src-tauri/src/cli_pools/idle.rs", "utf8");

  assert.ok(
    controller.includes("disambiguate_active_instance_with"),
    "plan_rotation must call disambiguation helper when multiple provider instances exist",
  );
  assert.ok(
    controller.includes("AmbiguousMultipleProcesses"),
    "plan_rotation must fail closed with AmbiguousMultipleProcesses when disambiguation returns None",
  );
  assert.ok(
    disambiguate.includes("ACTIVE_SESSION_WINDOW_SECS: u64 = 5 * 60"),
    "disambiguation must enforce a 5-minute activity window",
  );
  assert.ok(
    disambiguate.includes("normalize_path") && disambiguate.includes("all_distinct_cwds"),
    "disambiguation must verify distinct normalized cwds with no conflicting peers",
  );
  assert.ok(
    idle.includes("resolve_session_activity_secs"),
    "idle helper must expose session/rollout activity timestamp lookup",
  );
});
