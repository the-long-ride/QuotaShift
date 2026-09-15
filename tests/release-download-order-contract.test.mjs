import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workflow = readFileSync(new URL("../.github/workflows/publish.yml", import.meta.url), "utf8");

test("release download table lists Windows then macOS then Linux", () => {
  const windows = workflow.indexOf('for file in *-portable.exe *-setup.exe');
  const macos = workflow.indexOf('for file in *.dmg');
  const linux = workflow.indexOf('for file in *.deb *.AppImage');

  assert.notEqual(windows, -1, "missing explicit Windows release rows");
  assert.notEqual(macos, -1, "missing explicit macOS release rows");
  assert.notEqual(linux, -1, "missing explicit Linux release rows");
  assert.ok(windows < macos && macos < linux, "release rows must be Windows -> macOS -> Linux");
});

test("GitHub release asset upload patterns use Windows then macOS then Linux", () => {
  const portable = workflow.indexOf("release-assets/*-portable.exe");
  const setup = workflow.indexOf("release-assets/*-setup.exe");
  const dmg = workflow.indexOf("release-assets/*.dmg");
  const deb = workflow.indexOf("release-assets/*.deb");
  const appImage = workflow.indexOf("release-assets/*.AppImage");

  for (const [name, position] of Object.entries({ portable, setup, dmg, deb, appImage })) {
    assert.notEqual(position, -1, `missing ${name} upload pattern`);
  }
  assert.ok(portable < setup && setup < dmg && dmg < deb && deb < appImage,
    "release assets must be uploaded Windows -> macOS -> Linux");
});
