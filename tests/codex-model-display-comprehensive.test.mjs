import test from "node:test";
import assert from "node:assert/strict";
import {
  humanizeCodexModelName,
  formatCodexModelLine,
  copyCodexModelId,
} from "../.test-build/codex-model-display.js";

test("humanizeCodexModelName replaces hyphens and normalizes whitespace", () => {
  assert.equal(humanizeCodexModelName("gpt-4o-mini", "gpt-4o-mini"), "gpt 4o mini");
  assert.equal(humanizeCodexModelName("", "gpt-4o"), "gpt 4o");
  assert.equal(humanizeCodexModelName(null, "claude-3-5-sonnet"), "claude 3 5 sonnet");
  assert.equal(humanizeCodexModelName("  my--custom---model  ", "id"), "my custom model");
  assert.equal(humanizeCodexModelName(undefined, ""), "");
});

test("formatCodexModelLine combines humanized name with raw id", () => {
  assert.equal(
    formatCodexModelLine("o1-preview", "o1-preview"),
    "o1 preview - o1-preview"
  );
  assert.equal(
    formatCodexModelLine(null, "gpt-4o"),
    "gpt 4o - gpt-4o"
  );
});

test("copyCodexModelId writes to provided clipboard interface", async () => {
  const written = [];
  const mockClipboard = {
    writeText: async (text) => {
      written.push(text);
    },
  };

  const ok = await copyCodexModelId("gpt-4o", mockClipboard);
  assert.equal(ok, true);
  assert.deepEqual(written, ["gpt-4o"]);
});

test("copyCodexModelId falls back when clipboard throws", async () => {
  const failingClipboard = {
    writeText: async () => {
      throw new Error("Permission denied");
    },
  };

  // When no document is available in Node, it returns false
  const ok = await copyCodexModelId("gpt-4o", failingClipboard);
  assert.equal(ok, false);
});

test("copyCodexModelId returns false when no clipboard and no document", async () => {
  const ok = await copyCodexModelId("test-model", null);
  assert.equal(ok, false);
});

test("copyCodexModelId uses document fallback when document is present", async () => {
  let execCommandCalled = false;
  let appended = false;
  let removed = false;

  const mockTextarea = {
    value: "",
    setAttribute: () => {},
    style: {},
    select: () => {},
    remove: () => {
      removed = true;
    },
  };

  globalThis.document = {
    createElement: () => mockTextarea,
    body: {
      appendChild: () => {
        appended = true;
      },
    },
    execCommand: (cmd) => {
      if (cmd === "copy") {
        execCommandCalled = true;
        return true;
      }
      return false;
    },
  };

  try {
    const ok = await copyCodexModelId("fallback-model", null);
    assert.equal(ok, true);
    assert.equal(appended, true);
    assert.equal(removed, true);
    assert.equal(execCommandCalled, true);
  } finally {
    delete globalThis.document;
  }
});
