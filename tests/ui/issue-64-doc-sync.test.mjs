import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

test("v1.2.2 specs have a single intact provider specification", () => {
  const provider = read("docs/specs/03-provider-monitoring-and-switching.md");
  assert.equal(provider.split("# 03 — Provider Monitoring and Switching").length - 1, 1);
  assert.equal(provider.split("**Audience:**").length - 1, 1);
  assert.ok(provider.includes("Public Model Alias Validation"));
  assert.ok(provider.includes("**Next →** [04 — Desktop Shell and Overlay]"));
  assert.ok(!provider.includes("}. Outbound"));
  assert.ok(!provider.includes("opt-in setting only gates the overlay/taskbar badge"));
});

test("Claude reset switch docs accurately describe network opt-in and unknown counts", () => {
  for (const path of [
    "docs/specs/03-provider-monitoring-and-switching.md",
    "docs/specs/04-desktop-shell-and-overlay.md",
    "docs/specs/06-settings-and-configuration.md",
    "README.md",
    "llm.txt",
  ]) {
    const doc = read(path);
    assert.match(doc, /Claude reset/i);
    assert.doesNotMatch(doc, /Show Claude reset count \(experimental\)|Show Claude reset count <Experimental>/);
  }
});
