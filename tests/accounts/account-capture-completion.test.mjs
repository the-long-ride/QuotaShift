import test from "node:test";
import assert from "node:assert/strict";

import { completeAccountCapture } from "../../.test-build/account/capture-completion.js";

test("already-present capture closes the modal before showing a success toast", () => {
  const events = [];

  completeAccountCapture(
    { platformName: "Codex", addedCount: 0, alreadyPresentCount: 1 },
    () => events.push({ type: "close" }),
    (message) => events.push({ type: "success-toast", message }),
  );

  assert.deepEqual(events, [
    { type: "close" },
    {
      type: "success-toast",
      message: "Codex account is already present in your account list.",
    },
  ]);
});

test("capture completion reports both new and already-present accounts", () => {
  const messages = [];

  completeAccountCapture(
    { platformName: "Antigravity", addedCount: 1, alreadyPresentCount: 2 },
    () => {},
    (message) => messages.push(message),
  );

  assert.deepEqual(messages, [
    "Added 1 Antigravity account to your account list. 2 accounts were already present.",
  ]);
});
