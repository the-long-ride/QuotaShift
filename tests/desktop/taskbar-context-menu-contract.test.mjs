import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("TaskbarColumn triggers context menu on both left-click and right-click", () => {
  const column = read("src/components/taskbar/TaskbarColumn.tsx");
  assert.match(column, /onMenu\?: \(column: Column, element: HTMLElement\) => void;/);
  assert.match(column, /onClick=\{[\s\S]*?onMenu\?\.?\(\s*column,\s*event\.currentTarget\s*\)/);
  assert.match(column, /onContextMenu=\{[\s\S]*?event\.preventDefault\(\)/);
  assert.match(
    column,
    /onContextMenu=\{[\s\S]*?onMenu\?\.?\(\s*column,\s*event\.currentTarget\s*\)/,
  );
});

test("TaskbarApp routes onMenu, tracks menu open state, and suppresses hover tooltip when menu open", () => {
  const app = read("src/components/taskbar/TaskbarApp.tsx");
  assert.match(app, /isMenuOpenRef = useRef\(false\)/);
  assert.match(app, /"taskbar-menu-closed"/);
  assert.match(app, /const showMenu = \(column: Column, element: HTMLElement\) => \{/);
  assert.match(app, /isMenuOpenRef\.current = true/);
  assert.match(app, /void emit\("overlay-tooltip-data",\s*\{[\s\S]*?menu: true/);
  assert.match(app, /if \(isMenuOpenRef\.current\) return;/);
  assert.match(app, /onMenu=\{showMenu\}/);
  assert.match(
    app,
    /onOpen=\{\(target\) => openDashboard\(target\.provider,\s*target\.accountId\)\}/,
  );
});

test("TaskbarContextMenuView handles blur dismiss, escape, and outside clicks", () => {
  const menuView = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  assert.match(menuView, /placeTaskbarMenu\(/);
  assert.match(menuView, /window\.addEventListener\("blur", handleBlur\)/);
  assert.match(menuView, /if \(e\.key === "Escape"\) onClose\(\)/);
  assert.match(menuView, /closest\?\.[\s\S]*?overlay-context-menu/);
  assert.match(menuView, /<OverlayContextMenu[\s\S]*?localTooltips=\{true\}/);
});

test("OverlayTooltipApp renders TaskbarContextMenuView when menu flag is set", () => {
  const tooltipApp = read("src/components/overlay/OverlayTooltipApp.tsx");
  assert.match(tooltipApp, /data\?\.visible && data\.menu/);
  assert.match(tooltipApp, /<TaskbarContextMenuView/);
  assert.match(tooltipApp, /emit\("taskbar-menu-closed"\)/);
});

test("Per-account refresh and dashboard navigation target specific account and trigger scroll focus", () => {
  const taskbarMenu = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  const overlayMenu = read("src/components/overlay/useOverlayContextMenu.ts");
  const scrollHelper = read("src/utils/common/account-card-scroll.ts");
  const listeners = read("src/hooks/app/useAppEventListeners.ts");

  assert.match(taskbarMenu, /FOCUS_ACCOUNT_CARD_EVENT/);
  assert.match(taskbarMenu, /emit\(FOCUS_ACCOUNT_CARD_EVENT,\s*\{[\s\S]*?provider: data\.provider/);
  assert.match(taskbarMenu, /emit\("request-refresh-usage",\s*\{[\s\S]*?provider: data\.provider/);

  assert.match(overlayMenu, /FOCUS_ACCOUNT_CARD_EVENT/);
  assert.match(overlayMenu, /resolveTargetAccountFromClick\(/);
  assert.match(
    overlayMenu,
    /emit\("request-refresh-usage",\s*\{[\s\S]*?provider: data\.provider,\s*accountId: target\.accountId/,
  );

  assert.match(scrollHelper, /export const FOCUS_ACCOUNT_CARD_EVENT = "focus-account-card"/);
  assert.match(scrollHelper, /export function scrollToAccountCard/);
  assert.match(scrollHelper, /account-card--focused/);

  assert.match(listeners, /listen<FocusAccountCardPayload>\(\s*FOCUS_ACCOUNT_CARD_EVENT/);
  assert.match(listeners, /scrollToAccountCard\(provider,\s*accountId\)/);
});

test("Multi-track card click resolver accurately maps DOM attributes and bounding geometry", () => {
  const targetHelper = read("src/utils/common/overlay-card-target.ts");
  assert.match(targetHelper, /export function resolveTargetAccountFromClick/);
  assert.match(targetHelper, /data-overlay-card-account-id/);
  assert.match(targetHelper, /data-overlay-card-index/);
});

test("OverlayContextMenu supports local tooltips and placeTaskbarMenu includes tooltip headroom", () => {
  const menuCode = read("src/components/overlay/OverlayContextMenu.tsx");
  const cardCode = read("src/components/taskbar/TaskbarTooltipCard.tsx");
  const css = read("src/styles/desktop/taskbar-tooltip.css");
  assert.match(menuCode, /localTooltips\?: boolean;/);
  assert.match(menuCode, /const \[activeTooltip, setActiveTooltip\] = React\.useState/);
  assert.match(cardCode, /tooltipHeadroom = 28/);
  assert.match(css, /\.taskbar-menu-root\s*\{[\s\S]*?padding-top:\s*28px/);
  assert.match(
    css,
    /\.taskbar-menu-root \.overlay-context-menu\s*\{[\s\S]*?zoom:\s*1\s*!important/,
  );
});

test("Tray tooltip is strictly branded as QuotaShift - the-long-ride across all lifecycle states", () => {
  const lib = read("src-tauri/src/lib.rs");
  const winMgr = read("src-tauri/src/window/window_manager.rs");
  assert.match(lib, /\.tooltip\("QuotaShift - the-long-ride"\)/);
  assert.match(winMgr, /tray\.set_tooltip\(Some\("QuotaShift - the-long-ride"\)\)/);
});

test("Untrack this account button in overlay and taskbar triggers untrack request and listener", () => {
  const menuCode = read("src/components/overlay/OverlayContextMenu.tsx");
  const overlayMenu = read("src/components/overlay/useOverlayContextMenu.ts");
  const taskbarMenu = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  const listeners = read("src/hooks/app/useAppEventListeners.ts");

  assert.match(menuCode, /onUntrackAccount\?: \(e: React\.MouseEvent\) => void;/);
  assert.match(menuCode, /data-tooltip="Untrack this account"/);
  assert.match(menuCode, /aria-label="Untrack this account"/);

  assert.match(overlayMenu, /handleUntrackAccount/);
  assert.match(overlayMenu, /emit\("request-untrack-account"/);

  assert.match(taskbarMenu, /handleUntrackAccount/);
  assert.match(taskbarMenu, /emit\("request-untrack-account"/);
  assert.match(taskbarMenu, /onUntrackAccount=\{handleUntrackAccount\}/);

  assert.match(listeners, /listen[\s\S]*?"request-untrack-account"/);
  assert.match(listeners, /untrackAccount\(\{ provider, id: accountId \}\)/);
});

test("TaskbarContextMenuView automatically hides after 5s without hover or interaction", () => {
  const taskbarMenu = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  assert.match(taskbarMenu, /5000/);
  assert.match(taskbarMenu, /pointerenter/);
  assert.match(taskbarMenu, /pointerleave/);
  assert.match(taskbarMenu, /clearIdleTimer/);
  assert.match(taskbarMenu, /startIdleTimer/);
});

test("taskbar tooltip and menu are placed on the monitor under the taskbar anchor", () => {
  const monitor = read("src/components/taskbar/taskbar-monitor.ts");
  const card = read("src/components/taskbar/TaskbarTooltipCard.tsx");
  assert.match(monitor, /monitorFromPoint\(anchorX, anchorY\)/);
  assert.match(monitor, /export async function moveOntoMonitor/);
  assert.match(card, /const monitor = await anchorMonitor\(anchorX, anchorY\);/);
  assert.equal(card.match(/await moveOntoMonitor\(win, monitor\)/g)?.length, 2);
  assert.equal(card.match(/clampToMonitor\(monitor,/g)?.length, 2);
  assert.doesNotMatch(card, /currentMonitor/);
});

test("taskbar menu closes on any click outside it via the native dismiss watcher", () => {
  const menuView = read("src/components/taskbar/TaskbarContextMenuView.tsx");
  const lib = read("src-tauri/src/lib.rs");
  assert.match(menuView, /listen\("taskbar-menu-dismiss", \(\) => onCloseRef\.current\(\)\)/);
  assert.match(menuView, /invoke\("start_taskbar_menu_dismiss"\)/);
  assert.match(menuView, /invoke\("stop_taskbar_menu_dismiss"\)/);
  assert.match(lib, /window::menu_dismiss::start_taskbar_menu_dismiss/);
  assert.match(lib, /window::menu_dismiss::stop_taskbar_menu_dismiss/);
});

test("one-line tooltips keep the fixed-width window but resize it and centre from the width it was set to", () => {
  const app = read("src/components/overlay/OverlayTooltipApp.tsx");
  const placement = read("src/components/overlay/overlay-tooltip-placement.ts");
  assert.match(app, /await placeTextTooltip\(\s*win,\s*payload,/);
  assert.doesNotMatch(app, /outerSize\.width = expectedWidth/);
  assert.match(placement, /await win\.setSize\(new PhysicalSize\(width, baseHeight\)\)/);
  assert.doesNotMatch(placement, /win\.outerSize\(\)/);
  assert.match(placement, /Math\.round\(centerX - width \/ 2\)/);
  assert.match(placement, /anchorMonitor\(centerX, payload\.y\)/);
  assert.doesNotMatch(placement, /clampToMonitor/);
});

test("text tooltip window is wide enough for long hints and shares one width constant", () => {
  const placement = read("src/components/overlay/overlay-tooltip-placement.ts");
  assert.match(placement, /export const TEXT_TOOLTIP_WIDTH = 480;/);
  const sources = [
    read("src/components/overlay/useOverlayTooltipPublish.ts"),
    read("src/components/overlay/OverlayContextMenu.tsx"),
  ];
  for (const source of sources) {
    assert.match(source, /TEXT_TOOLTIP_WIDTH/);
    assert.doesNotMatch(source, /Math\.round\(340 \*/);
  }
});

test("text tooltips are capped at the whole account card width and wrap instead of clipping", () => {
  const publish = read("src/components/overlay/useOverlayTooltipPublish.ts");
  const menu = read("src/components/overlay/OverlayContextMenu.tsx");
  const css = read("src/styles/desktop/overlay-guardrails.css");
  assert.match(publish, /maxWidth: Math\.round\(cardWidth\)/);
  assert.match(menu, /maxWidth: outerSize\.width/);
  assert.match(css, /max-width: calc\(\(100% - 8px\) \/ var\(--overlay-ui-scale, 1\)\)/);
  assert.match(css, /\.overlay-tooltip-root \.overlay-tooltip-text \{[\s\S]*?white-space: normal;/);
});

test("tooltip root fills the compensated #app-root: viewport units would shift the text off-centre", () => {
  const css = read("src/styles/desktop/overlay-guardrails.css");
  const root = css.match(/\.overlay-tooltip-root \{[^}]*\}/)?.[0] ?? "";
  assert.match(root, /width: 100%;/);
  assert.match(root, /height: 100%;/);
  assert.doesNotMatch(root, /100v[wh]/);
  assert.doesNotMatch(
    css.match(/\.overlay-tooltip-root \.overlay-tooltip \{[^}]*\}/)?.[0] ?? "",
    /vw/,
  );
});

test("tooltip coordinates are read only after the overlay layout settled, and placements never interleave", () => {
  const anchor = read("src/components/overlay/overlay-tooltip-anchor.ts");
  const app =
    read("src/components/overlay/OverlayApp.tsx") +
    read("src/components/overlay/useOverlayTooltipPublish.ts");
  const tooltipApp = read("src/components/overlay/OverlayTooltipApp.tsx");
  const placement = read("src/components/overlay/overlay-tooltip-placement.ts");
  assert.match(anchor, /export async function settledCardAnchor/);
  assert.match(anchor, /snapshotKey\(previous\) === snapshotKey\(current\)/);
  assert.match(anchor, /window\.innerWidth \* \(window\.devicePixelRatio \|\| 1\)/);
  assert.match(app, /if \(cancelled\) return;/);
  assert.match(app, /return \(\) => \{\s*cancelled = true;/);
  assert.doesNotMatch(app, /tooltip:debug/);
  assert.doesNotMatch(placement, /tooltip:debug/);
  assert.match(tooltipApp, /const seq = \+\+eventSeqRef\.current;/);
  assert.match(tooltipApp, /\(\) => !disposed && seq === eventSeqRef\.current/);
  assert.match(tooltipApp, /if \(disposed\) unlisten\(\);/);
  assert.doesNotMatch(tooltipApp, /setSize/);
  assert.equal(placement.match(/if \(!isCurrent\(\)\) return;/g)?.length, 5);
});

test("tooltip fonts were raised a little for overlay, taskbar card and menu tooltips", () => {
  const overlay = read("src/styles/desktop/overlay-guardrails.css");
  assert.match(overlay, /\.overlay-tooltip-text \{[\s\S]*?font-size: 10\.5px;/);
  const card = read("src/styles/desktop/taskbar-tooltip.css");
  assert.match(card, /\.taskbar-tooltip \{[\s\S]*?font-size: 11px;/);
  assert.match(card, /\.taskbar-tooltip-title \{[\s\S]*?font-size: 13px;/);
});
