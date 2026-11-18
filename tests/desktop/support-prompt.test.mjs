import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FIRST_USE_DELAY_MS,
  GITHUB_DONATE_URL,
  GITHUB_REPO_API_URL,
  GITHUB_REPO_URL,
  REMIND_INTERVAL_MS,
  STAR_COUNT_CACHE_TTL_MS,
  formatStarCount,
  loadCachedStarCount,
  loadSupportPromptState,
  markSupportPromptShown,
  msUntilNextSupportPrompt,
  saveCachedStarCount,
  setSupportPromptDontShowAgain,
  shouldShowSupportPrompt,
} from "../../.test-build/common/support-prompt.js";

const read = (path) => fs.readFileSync(path, "utf8");

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

test("support-prompt utility enforces 24h first-use delay, 7d repeat cadence, and dont-show-again", () => {
  assert.equal(FIRST_USE_DELAY_MS, 24 * 60 * 60 * 1000);
  assert.equal(REMIND_INTERVAL_MS, 7 * 24 * 60 * 60 * 1000);
  assert.equal(GITHUB_REPO_URL, "https://github.com/the-long-ride/QuotaShift");
  assert.equal(GITHUB_DONATE_URL, "https://github.com/the-long-ride#donate");
  assert.equal(GITHUB_REPO_API_URL, "https://api.github.com/repos/the-long-ride/QuotaShift");

  const storage = createMemoryStorage();
  const t0 = 1_700_000_000_000;

  const initial = loadSupportPromptState(storage, t0);
  assert.deepEqual(initial, {
    firstSeenAt: t0,
    lastShownAt: null,
    dontShowAgain: false,
  });
  assert.equal(shouldShowSupportPrompt(initial, t0), false);
  assert.equal(shouldShowSupportPrompt(initial, t0 + FIRST_USE_DELAY_MS - 1), false);
  assert.equal(msUntilNextSupportPrompt(initial, t0 + 1000), FIRST_USE_DELAY_MS - 1000);
  assert.equal(shouldShowSupportPrompt(initial, t0 + FIRST_USE_DELAY_MS), true);

  const afterFirstShow = markSupportPromptShown(t0 + FIRST_USE_DELAY_MS, false, storage);
  assert.equal(afterFirstShow.lastShownAt, t0 + FIRST_USE_DELAY_MS);
  assert.equal(afterFirstShow.dontShowAgain, false);
  assert.equal(
    shouldShowSupportPrompt(afterFirstShow, t0 + FIRST_USE_DELAY_MS + REMIND_INTERVAL_MS - 1),
    false,
  );
  assert.equal(
    shouldShowSupportPrompt(afterFirstShow, t0 + FIRST_USE_DELAY_MS + REMIND_INTERVAL_MS),
    true,
  );

  const dismissed = setSupportPromptDontShowAgain(
    true,
    t0 + FIRST_USE_DELAY_MS + 1000,
    storage,
  );
  assert.equal(dismissed.dontShowAgain, true);
  assert.equal(
    shouldShowSupportPrompt(dismissed, t0 + FIRST_USE_DELAY_MS + 365 * 24 * 60 * 60 * 1000),
    false,
  );
  assert.equal(msUntilNextSupportPrompt(dismissed, t0), null);

  const restored = setSupportPromptDontShowAgain(false, t0 + FIRST_USE_DELAY_MS + 2000, storage);
  assert.equal(restored.dontShowAgain, false);

  storage.setItem("quotashift_support_prompt_v1", "{bad-json");
  const recovered = loadSupportPromptState(storage, t0 + 5000);
  assert.equal(recovered.firstSeenAt, t0 + 5000);
  assert.equal(recovered.lastShownAt, null);
  assert.equal(recovered.dontShowAgain, false);

  assert.equal(formatStarCount(null), null);
  assert.equal(formatStarCount(-1), null);
  assert.equal(formatStarCount(0), "0");
  assert.equal(formatStarCount(16), "16");

  saveCachedStarCount(42, storage, t0);
  assert.deepEqual(loadCachedStarCount(storage, t0 + 1000), {
    count: 42,
    isFresh: true,
  });
  assert.deepEqual(loadCachedStarCount(storage, t0 + STAR_COUNT_CACHE_TTL_MS + 1), {
    count: 42,
    isFresh: false,
  });
});

test("SettingsModal header renders yellow Star and pink Donate outline buttons to the right of version link", () => {
  const settingsCode = read("src/components/common/settings/SettingsModal.tsx");
  const headerButtonsCode = read(
    "src/components/common/support/SettingsSupportHeaderButtons.tsx",
  );
  const supportCss = read("src/styles/shared/support-prompt-modal.css");

  const versionIdx = settingsCode.indexOf("settings-modal-version-link");
  const supportIdx = settingsCode.indexOf("<SettingsSupportHeaderButtons");
  const themeIdx = settingsCode.indexOf("settings-modal-theme-toggle");

  assert.ok(versionIdx > 0 && supportIdx > 0 && themeIdx > 0);
  assert.ok(
    versionIdx < supportIdx && supportIdx < themeIdx,
    "SettingsSupportHeaderButtons must appear immediately to the right of the version link",
  );

  const starIdx = headerButtonsCode.indexOf("settings-modal-support-btn--star");
  const donateIdx = headerButtonsCode.indexOf("settings-modal-support-btn--donate");
  assert.ok(starIdx > 0 && donateIdx > 0 && starIdx < donateIdx);
  assert.match(headerButtonsCode, /<SupportStarIcon/);
  assert.match(headerButtonsCode, /<SupportHeartIcon/);
  assert.match(headerButtonsCode, /openUrl\(GITHUB_REPO_URL\)/);
  assert.match(headerButtonsCode, /openUrl\(GITHUB_DONATE_URL\)/);
  assert.match(supportCss, /\.settings-modal-support-btn--star\s*\{[^}]*border:\s*1px solid/s);
  assert.match(supportCss, /\.settings-modal-support-btn--donate\s*\{[^}]*border:\s*1px solid/s);
});

test("SupportPromptModal and AppModals provide star count, donate link, and dont-show-again UI", () => {
  const modalCode = read("src/components/common/support/SupportPromptModal.tsx");
  const appModalsCode = read("src/components/app/AppModals.tsx");
  const stylesCode = read("src/styles.css");

  assert.match(modalCode, /Enjoying QuotaShift\?/);
  assert.match(modalCode, /Leave a star/);
  assert.match(modalCode, /Make a donation/);
  assert.match(modalCode, /Star on GitHub/);
  assert.match(modalCode, /Donate/);
  assert.match(modalCode, /Don(?:&apos;|')t show this again/);
  assert.match(modalCode, /Maybe later/);
  assert.match(modalCode, /openUrl\(GITHUB_REPO_URL\)/);
  assert.match(modalCode, /openUrl\(GITHUB_DONATE_URL\)/);
  assert.match(appModalsCode, /<SupportPromptModal\s*\/>/);
  assert.match(stylesCode, /support-prompt-modal\.css/);
});
