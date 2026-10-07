import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path) => fs.readFileSync(path, "utf8");

test("account-card-scroll exports centering, container resolution, and robust element lookup", () => {
  const scrollHelper = read("src/utils/common/account-card-scroll.ts");

  assert.match(scrollHelper, /export function findAccountCardElement/);
  assert.match(scrollHelper, /export function findScrollContainer/);
  assert.match(scrollHelper, /export function centerElementInContainer/);
  assert.match(scrollHelper, /export function scrollToAccountCard/);

  // Verifies fallback resolution for generic accounts or unmapped cards
  assert.match(scrollHelper, /\.account-card\.monitored/);
  assert.match(scrollHelper, /\.account-card\.account-card--active/);

  // Verifies centering math: (container.clientHeight - elementRect.height) / 2
  assert.match(scrollHelper, /\(container\.clientHeight - elementRect\.height\) \/ 2/);
  assert.match(scrollHelper, /container\.scrollTo\(\{[\s\S]*?top: targetScrollTop/);

  // Verifies post-scroll verification pass
  assert.match(scrollHelper, /verifyCentering/);
  assert.match(scrollHelper, /account-card--focused/);
});

test("OverlayApp and useOverlayDrag wire cardsRef and target resolution for double-click open", () => {
  const app = read("src/components/overlay/OverlayApp.tsx");
  const drag = read("src/components/overlay/useOverlayDrag.ts");

  assert.match(app, /const cardsRef = useRef<OverlayAccountData\[\]>\(\[\]\);/);
  assert.match(app, /cardsRef,/);
  assert.match(app, /cardsRef\.current = cards;/);

  assert.match(drag, /cardsRef\?: React\.MutableRefObject<OverlayAccountData\[\]>;/);
  assert.match(drag, /const targetCards = cards \?\? cardsRef\?\.current;/);
  assert.match(drag, /resolveTargetAccountFromClick\(e\.target, e\.clientY, targetCards\)/);
  assert.match(drag, /emit\(FOCUS_ACCOUNT_CARD_EVENT, \{ provider: effectiveTab, accountId \}\)/);
});

test("Dashboard tabs center account cards on double-click", () => {
  const codex = read("src/components/codex/CodexTab.tsx");
  const antigravity = read("src/components/antigravity/AntigravityTab.tsx");

  assert.match(codex, /scrollToAccountCard\("codex", account\.id\)/);
  assert.match(antigravity, /scrollToAccountCard\("antigravity", account\.id\)/);
});
