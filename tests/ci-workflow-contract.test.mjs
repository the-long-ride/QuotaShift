import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const workflow = fs.readFileSync(".github/workflows/ci.yml", "utf8");

test("CI build-and-test matrix covers Windows Linux and macOS", () => {
  assert.match(workflow, /platform:\s*['"]windows-latest['"][\s\S]*?os-name:\s*['"]windows['"]/);
  assert.match(workflow, /platform:\s*['"]ubuntu-22\.04['"][\s\S]*?os-name:\s*['"]linux['"]/);
  assert.match(workflow, /platform:\s*['"]macos-latest['"][\s\S]*?os-name:\s*['"]macos['"]/);
});

test("macOS CI uses the shared frontend and Rust test path with Rust caching", () => {
  assert.match(
    workflow,
    /- name: Rust cache \(macOS\)[\s\S]*?if: matrix\.os-name == ['"]macos['"][\s\S]*?uses: swatinem\/rust-cache@v2[\s\S]*?workspaces: ['"]\.\/src-tauri -> target['"]/,
  );
  assert.match(workflow, /- name: Frontend utility and security tests\s+run: pnpm test/);
  assert.match(workflow, /- name: Verify Code Coverage Gate[\s\S]*?run: pnpm run test:coverage/);
  assert.match(
    workflow,
    /- name: Rust tests\s+run: cargo test --manifest-path src-tauri\/Cargo\.toml --verbose/,
  );
  assert.match(
    workflow,
    /- name: Rust check\s+run: cargo check --manifest-path src-tauri\/Cargo\.toml --verbose/,
  );
});

test("macOS explicitly provisions Python for cross-platform writer security tests", () => {
  assert.match(
    workflow,
    /- name: Set up Python \(macOS\)[\s\S]*?if: matrix\.os-name == ['"]macos['"][\s\S]*?uses: actions\/setup-python@v6[\s\S]*?python-version: ['"]3\.x['"]/,
  );
});
