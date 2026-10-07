import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTaskbarColumns,
  buildTaskbarLines,
  buildTaskbarSections,
  formatTaskbarPercent,
  formatTaskbarValues,
  shortWindowLabel,
  taskbarTooltipText,
} from "../../.test-build/common/taskbar-columns.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("one column per tracked account, primary first", () => {
  const columns = buildTaskbarColumns({
    provider: "codex",
    accountId: "a",
    label: "work",
    email: "work@example.test",
    tier: "plus",
    fiveHourPercent: 80,
    weeklyPercent: 40,
    additionalAccounts: [
      { provider: "codex", accountId: "b", label: "", email: "side@example.test" },
    ],
  });
  assert.deepEqual(
    columns.map((c) => [c.key, c.label, c.initial]),
    [
      ["a", "work", "W"],
      ["b", "side@example.test", "S"],
    ],
  );
  assert.deepEqual(
    columns[0].lines.map((line) => [line.label, line.icon, line.values]),
    [
      ["5H", null, [80]],
      ["WK", null, [40]],
    ],
  );
  assert.equal(columns[1].lines[0].values[0], null);
  assert.equal(columns[0].details.platform, "ChatGPT Codex");
  assert.equal(columns[0].details.sections[0].meters.length, 2);
  assert.equal(columns[0].tier, "plus");
  assert.equal(columns[1].tier, null);
  assert.deepEqual(buildTaskbarColumns(null), []);
});

test("antigravity families become logo lines; other accounts get one line per window", () => {
  const sections = buildTaskbarSections({
    provider: "antigravity",
    label: "x",
    quotaRows: [
      { label: "Gemini", fiveHourPercent: 70, weeklyPercent: 30 },
      { label: "Claude / GPT", fiveHourPercent: null, weeklyPercent: 55 },
      { label: "Other", fiveHourPercent: 1, weeklyPercent: 1 },
    ],
  });
  assert.equal(sections.length, 3, "the hover card keeps every family");
  assert.deepEqual(
    buildTaskbarLines(sections).map((line) => [line.icon, line.values]),
    [
      ["gemini", [70, 30]],
      ["claude-openai", [null, 55]],
    ],
  );
  const single = buildTaskbarSections({
    provider: "codex",
    label: "x",
    singleBars: [
      { label: "5h", percent: 12 },
      { label: "Weekly", percent: Number.NaN },
      { label: "Monthly", percent: 9 },
    ],
  });
  assert.deepEqual(
    buildTaskbarLines(single).map((line) => [line.label, line.values]),
    [
      ["5H", [12]],
      ["WK", [null]],
    ],
  );
  const monthly = buildTaskbarSections({
    provider: "codex",
    label: "x",
    singleBars: [{ label: "Monthly", percent: 40 }],
  });
  assert.deepEqual(
    buildTaskbarLines(monthly).map((line) => line.label),
    ["MO"],
  );
  assert.equal(shortWindowLabel("Wk"), "WK");
  assert.equal(shortWindowLabel("Daily"), "DAI");
  assert.equal(formatTaskbarValues([70, null]), "70%/–");
});

test("percent and tooltip formatting", () => {
  assert.equal(formatTaskbarPercent(null), "–");
  assert.equal(formatTaskbarPercent(42.6), "43%");
  assert.equal(formatTaskbarPercent(140), "100%");
  assert.equal(formatTaskbarPercent(-3), "0%");
  const [column] = buildTaskbarColumns({
    provider: "claude",
    label: "home",
    email: "home@example.test",
    resetCount: 2,
    loading: true,
    fiveHourPercent: 10,
    weeklyPercent: null,
  });
  assert.equal(column.resetCount, 2);
  assert.equal(column.details.resetCount, 2);
  assert.equal(column.details.loading, true);
  assert.equal(column.loading, true);
  assert.equal(column.key, "claude-0");
  assert.equal(taskbarTooltipText(column), "home - home@example.test · 5H 10% · WK –");
  const [plain] = buildTaskbarColumns({ provider: "codex", label: "", email: "" });
  assert.equal(plain.label, "Account");
  assert.equal(taskbarTooltipText(plain), "Account · 5H – · WK –");
});

test("taskbar window is configured, routed and reports its content size", () => {
  const conf = JSON.parse(read("src-tauri/tauri.conf.json"));
  const win = conf.app.windows.find((w) => w.label === "taskbar");
  assert.ok(win);
  assert.equal(win.url, "index.html?window=taskbar");
  assert.equal(win.decorations, false);
  assert.equal(win.transparent, true);
  assert.equal(win.visible, false);
  assert.equal(win.skipTaskbar, true);
  assert.equal(win.alwaysOnTop, true);
  assert.equal(win.focus, false);
  assert.match(read("src-tauri/capabilities/default.json"), /"taskbar"/);
  const main = read("src/main.tsx");
  assert.match(main, /window=taskbar/);
  assert.match(main, /<TaskbarApp \/>/);
  const app = read("src/components/taskbar/TaskbarApp.tsx");
  assert.match(app, /invoke\("set_taskbar_content_size"/);
  assert.match(app, /"overlay-data-update"/);
  assert.match(app, /invoke\("show_dashboard", tab \? \{ tab \} : \{\}\)/);
  assert.match(
    app,
    /onOpen=\{\(target\) => openDashboard\(target\.provider,\s*target\.accountId\)\}/,
  );
  assert.match(app, /strip\.scrollWidth/);
  // Dynamic theme: the strip and hover card support glassmorphism and mono (matching app light/dark).
  assert.match(app, /loadUiAdjustmentPreferences/);
  assert.match(app, /APP_THEME_EVENT/);
  assert.match(app, /data-overlay-theme=\{overlayTheme\}/);
  assert.match(app, /data-theme=\{appTheme\}/);
  for (const sheet of ["taskbar.css", "taskbar-tooltip.css"]) {
    assert.match(read(`src/styles/desktop/${sheet}`), /\[data-overlay-theme="mono"\]/);
  }
  const column = read("src/components/taskbar/TaskbarColumn.tsx");
  assert.match(column, /onDoubleClick=\{\(\) => onOpen\(column\)\}/);
  // Compact overlay look: real avatar (initial fallback on error) with tier, reset and provider badges.
  assert.match(column, /className="taskbar-avatar-img"/);
  assert.match(column, /onError=\{\(\) => setFailedUrl\(column\.avatarUrl\)\}/);
  assert.match(column, /resolveTierBadgeText\(column\.provider, column\.tier\)/);
  assert.match(column, /taskbar-reset-badge/);
  assert.match(column, /taskbar-provider-badge/);
  assert.doesNotMatch(column, /taskbar-bar-track/);
  const css = read("src/styles/desktop/taskbar.css");
  assert.match(css, /\.taskbar-strip \{\s*flex: 0 0 auto;[\s\S]*?margin-left: auto;/);
  assert.match(css, /\.taskbar-root \{[\s\S]*?justify-content: flex-start;/);
  // Side padding must exceed the 4px badge overhang so nothing is cut at the window edge.
  assert.match(css, /padding: 0 11px 0 7px;/);
  assert.match(css, /left: -4px;/);
  assert.match(css, /\.taskbar-value-pct \{[\s\S]*?margin-left: auto;/);
  assert.match(css, /\.taskbar-value-pct \{[\s\S]*?text-align: right;/);
  assert.match(app, /"overlay-tooltip-data"/);
  assert.match(app, /details: column\.details/);
  const tooltip = read("src/components/overlay/OverlayTooltipApp.tsx");
  assert.match(tooltip, /<TaskbarTooltipCard ref=\{detailsRef\}/);
  assert.match(tooltip, /placeTaskbarTooltip\(/);
  assert.match(read("src/styles.css"), /taskbar-tooltip\.css/);
  assert.match(
    read("src/styles/desktop/taskbar-tooltip.css"),
    /\.taskbar-tooltip-root\s*\{[\s\S]*?zoom:\s*var\(--overlay-ui-scale/,
  );
  assert.match(
    read("src/components/taskbar/TaskbarTooltipCard.tsx"),
    /card\.offsetWidth\s*\*\s*uiScale/,
  );
  assert.match(column, /<TaskbarLineIconView icon=\{line\.icon\}/);
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /taskbar_dock::set_display_mode/);
  assert.match(lib, /taskbar_dock::set_taskbar_content_size/);
});

test("taskbar display limits viewport to max 3 accounts with side arrow buttons for horizontal scroll", () => {
  const app = read("src/components/taskbar/TaskbarApp.tsx");
  const arrowComp = read("src/components/taskbar/TaskbarNavArrow.tsx");
  const css = read("src/styles/desktop/taskbar.css");

  assert.match(app, /MAX_VISIBLE_TASKBAR_ACCOUNTS\s*=\s*3/);
  assert.match(app, /columns\.slice\(startIndex,\s*startIndex \+ MAX_VISIBLE_TASKBAR_ACCOUNTS\)/);
  assert.match(app, /<TaskbarNavArrow[\s\S]*direction="left"/);
  assert.match(app, /<TaskbarNavArrow[\s\S]*direction="right"/);
  assert.match(app, /onWheel=\{handleWheel\}/);

  // User-provided chevron path in TaskbarNavArrow
  assert.match(arrowComp, /M476\.84,248\.107L233\.64,3\.2/);
  assert.match(arrowComp, /fill="currentColor"/);
  assert.match(arrowComp, /stroke="currentColor"/);

  // Left arrow is flipped
  assert.match(
    css,
    /\.taskbar-nav-arrow--left\s+\.taskbar-nav-arrow-icon\s*\{[\s\S]*transform:\s*scaleX\(-1\);/,
  );
  assert.match(css, /\.taskbar-nav-arrow\s*\{[\s\S]*cursor:\s*pointer;/);
});

test("taskbar tooltip card renders guardrail badges with shield icon when enabled", () => {
  const card = read("src/components/taskbar/TaskbarTooltipCard.tsx");
  const icon = read("src/components/common/GuardrailShieldIcon.tsx");
  const css = read("src/styles/desktop/taskbar-tooltip.css");
  assert.match(card, /<GuardrailShieldIcon/);
  assert.match(card, /5H\s*\{details\.guardrails\.fiveHourThresholdPct\}%/);
  assert.match(card, /WK\s*\{details\.guardrails\.weeklyThresholdPct\}%/);
  assert.match(card, /taskbar-tooltip-chip--guardrail/);
  assert.match(icon, /M20 6C20 6 19\.1843 6/);
  assert.match(css, /\.taskbar-tooltip-chip--guardrail/);
  const [column] = buildTaskbarColumns({
    provider: "claude",
    label: "claude-test",
    claudeGuardrails: {
      fiveHourEnabled: true,
      fiveHourThresholdPct: 85,
      weeklyEnabled: true,
      weeklyThresholdPct: 90,
    },
  });
  assert.equal(column.details.guardrails?.fiveHourEnabled, true);
  assert.equal(column.details.guardrails?.fiveHourThresholdPct, 85);
  assert.equal(column.details.guardrails?.weeklyEnabled, true);
  assert.equal(column.details.guardrails?.weeklyThresholdPct, 90);
});
