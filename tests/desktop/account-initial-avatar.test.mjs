import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  accountInitial,
  showsClaudeMark,
  CLAUDE_LOCAL_ACCOUNT_ID,
} from "../../.test-build/common/account-initial.js";
import { buildTaskbarColumns } from "../../.test-build/common/taskbar-columns.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("accountInitial uses the first non-blank name, uppercased", () => {
  assert.equal(accountInitial(["work"]), "W");
  assert.equal(accountInitial(["  ", null, "moon@example.com"]), "M");
  assert.equal(accountInitial([undefined, ""], "Q"), "Q");
  assert.equal(accountInitial([]), "?");
});

test("accountInitial keeps whole code points for accented and emoji aliases", () => {
  assert.equal(accountInitial(["éclair"]), "É");
  assert.equal(accountInitial(["🚀 team"]), "🚀");
});

test("only the local Claude session keeps the Claude mark; real accounts get a letter", () => {
  assert.equal(showsClaudeMark("claude", CLAUDE_LOCAL_ACCOUNT_ID), true);
  assert.equal(showsClaudeMark("claude", null), true);
  assert.equal(showsClaudeMark("claude", "acct-1"), false);
  assert.equal(showsClaudeMark("codex", CLAUDE_LOCAL_ACCOUNT_ID), false);
});

test("taskbar columns derive the letter from the alias", () => {
  const [column] = buildTaskbarColumns({
    provider: "claude",
    accountId: "acct-1",
    label: "default",
    email: "user@example.com",
    avatarUrl: null,
  });
  assert.equal(column.initial, "D");
});

test("Claude accounts show the alias letter on the overlay, taskbar and dashboard card", () => {
  const overlay = read("src/components/overlay/OverlayCard.tsx");
  assert.match(overlay, /claudeMark = showsClaudeMark\(data\.provider, data\.accountId\)/);
  assert.match(overlay, /overlay-avatar-initial--claude/);
  const taskbar = read("src/components/taskbar/TaskbarColumn.tsx");
  assert.match(
    taskbar,
    /const claudeMark = showsClaudeMark\(column\.provider, column\.accountId\)/,
  );
  assert.match(taskbar, /taskbar-avatar-fallback--claude[\s\S]*?\{column\.initial\}/);
  const card = read("src/components/claude/ClaudeAccountCards.tsx");
  assert.match(card, /className="codex-card-avatar claude-card-avatar"/);
  assert.match(card, /accountInitial\(\[alias\]\)/);
});

test("taskbar Claude badges follow the overlay layout", () => {
  const taskbar = read("src/components/taskbar/TaskbarColumn.tsx");
  assert.match(taskbar, /taskbar-guardrail-badge taskbar-guardrail-badge--five-hour/);
  assert.match(taskbar, /taskbar-guardrail-badge taskbar-guardrail-badge--weekly/);
  const css = read("src/styles/desktop/taskbar.css");
  assert.match(css, /\.taskbar-avatar--claude \.taskbar-tier-badge \{\s*left: -7px;/);
  assert.match(css, /\.taskbar-guardrail-badge \{[\s\S]*?right: -6px;/);
  assert.match(css, /\.taskbar-guardrail-badge--five-hour \{\s*top: -3px;/);
  assert.match(css, /\.taskbar-guardrail-badge--weekly \{\s*bottom: -3px;/);
});

test("Claude reset count moves to the top-left so the 5H guardrail cannot cover it", () => {
  const overlayCss = read("src/styles/desktop/overlay-guardrails.css");
  assert.match(
    overlayCss,
    /\[data-provider="claude"\] \.overlay-reset-badge \{\s*right: auto;\s*left: -6px;/,
  );
  const taskbarCss = read("src/styles/desktop/taskbar.css");
  assert.match(
    taskbarCss,
    /\.taskbar-avatar--claude \.taskbar-reset-badge \{\s*right: auto;\s*left: -5px;/,
  );
});

test("Claude tier badge and email form a left-aligned row under the header like Codex", () => {
  const card = read("src/components/claude/ClaudeAccountCards.tsx");
  assert.match(
    card,
    /account-card-email-tier-row">[\s\S]*?account-card-plan-badge[\s\S]*?claude-card-meta-separator[\s\S]*?className="claude-card-email"/,
  );
  const titleWrap = card.slice(
    card.indexOf("claude-card-title-wrap"),
    card.indexOf("claude-card-actions"),
  );
  assert.doesNotMatch(titleWrap, /claude-card-email|account-card-plan-badge/);
});

test("mono hover is an opaque tint of the mono colours instead of going see-through", () => {
  const mix = "color-mix(in srgb, var(--overlay-mono-fg) 10%, var(--overlay-mono-bg))";
  const taskbar = read("src/styles/desktop/taskbar.css");
  const overlay = read("src/styles/desktop/ui-adjustment.css");
  assert.match(
    taskbar,
    /\.taskbar-nav-arrow:hover \{[\s\S]*?color-mix\(in srgb, var\(--overlay-mono-fg\) 10%/,
  );
  assert.match(
    overlay,
    /\.overlay-nav-arrow:hover \{[\s\S]*?color-mix\(in srgb, var\(--overlay-mono-fg\) 10%/,
  );
  assert.ok(taskbar.includes(mix) && overlay.includes(mix));
});
