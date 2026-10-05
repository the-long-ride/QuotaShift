import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildTaskbarBars,
  buildTaskbarColumns,
  formatTaskbarPercent,
  taskbarTooltipText,
} from "../../.test-build/common/taskbar-columns.js";

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");

test("one column per tracked account, primary first", () => {
  const columns = buildTaskbarColumns({
    provider: "codex",
    accountId: "a",
    label: "work",
    email: "work@example.test",
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
  assert.deepEqual(columns[0].bars, [
    { label: "5H", percent: 80 },
    { label: "WK", percent: 40 },
  ]);
  assert.equal(columns[1].bars[0].percent, null);
  assert.deepEqual(buildTaskbarColumns(null), []);
});

test("bars prefer quota rows (tightest window), then single bars, max two", () => {
  assert.deepEqual(
    buildTaskbarBars({
      provider: "antigravity",
      label: "x",
      quotaRows: [
        { label: "Gemini", fiveHourPercent: 70, weeklyPercent: 30 },
        { label: "Claude", fiveHourPercent: null, weeklyPercent: 55 },
        { label: "Other", fiveHourPercent: 1, weeklyPercent: 1 },
      ],
    }),
    [
      { label: "Gemini", percent: 30 },
      { label: "Claude", percent: 55 },
    ],
  );
  assert.deepEqual(
    buildTaskbarBars({
      provider: "codex",
      label: "x",
      singleBars: [
        { label: "5H", percent: 12 },
        { label: "WK", percent: Number.NaN },
        { label: "MO", percent: 9 },
      ],
    }),
    [
      { label: "5H", percent: 12 },
      { label: "WK", percent: null },
    ],
  );
  assert.deepEqual(
    buildTaskbarBars({ provider: "claude", label: "x", quotaRows: [{ label: "Z" }] }),
    [{ label: "Z", percent: null }],
  );
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
  assert.match(app, /onOpen=\{\(target\) => openDashboard\(target\.provider\)\}/);
  assert.match(app, /strip\.scrollWidth/);
  const column = read("src/components/taskbar/TaskbarColumn.tsx");
  assert.match(column, /onDoubleClick=\{\(\) => onOpen\(column\)\}/);
  assert.match(column, /className=\{`taskbar-badge taskbar-badge--\$\{column\.provider\}`\}/);
  assert.doesNotMatch(column, /taskbar-bar-track|<img/);
  const css = read("src/styles/desktop/taskbar.css");
  assert.match(css, /\.taskbar-strip \{\s*flex: 0 0 auto;/);
  assert.match(app, /"overlay-tooltip-data"/);
  const lib = read("src-tauri/src/lib.rs");
  assert.match(lib, /taskbar_dock::set_display_mode/);
  assert.match(lib, /taskbar_dock::set_taskbar_content_size/);
});
