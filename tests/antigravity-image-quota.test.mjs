import test from "node:test";
import assert from "node:assert/strict";
import {
  findImageGenerationQuota,
  selectDisplayedCloudQuotas,
} from "../.test-build/antigravity/quota/antigravity-image-quota.js";

function quota(overrides = {}) {
  return {
    modelId: "image_generation_pool",
    displayName: "Image Generation",
    family: "other",
    remainingFraction: 0.5,
    remainingPercent: 50,
    resetAt: null,
    ...overrides,
  };
}

test("image meter remains independent of ordinary Gemini quota", () => {
  assert.equal(findImageGenerationQuota([{ ...quota(), modelId: "gemini_pool" }]), null);
  assert.deepEqual(findImageGenerationQuota([quota()]), quota());
});

test("exact quota snapshots do not resurrect stale image limits", () => {
  const oldImage = quota({ remainingPercent: 15 });
  const account = { cloudQuotas: [oldImage] };
  assert.equal(
    findImageGenerationQuota(selectDisplayedCloudQuotas(account, { quotas: [] })),
    oldImage,
  );
  assert.equal(
    findImageGenerationQuota(
      selectDisplayedCloudQuotas(account, {
        quotas: [{ model: "Gemini", percent: 40, refreshTime: "Ready" }],
      }),
    ),
    null,
  );
  assert.equal(
    findImageGenerationQuota(selectDisplayedCloudQuotas(account, { cloudQuotas: [] })),
    null,
  );
});

test("image quota percentages remain compatible with the global Remaining/Used setting", async () => {
  const { quotaPercentDisplay } = await import("../.test-build/common/settings/quota-percent-mode.js");
  assert.equal(quotaPercentDisplay(25, false), 25);
  assert.equal(quotaPercentDisplay(25, true), 75);
});
