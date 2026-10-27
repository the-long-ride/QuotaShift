import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("CommonDropdown component and styles exist", () => {
  const componentPath = path.resolve("src/components/common/CommonDropdown.tsx");
  const stylesPath = path.resolve("src/styles/common/common-dropdown.css");

  assert.ok(fs.existsSync(componentPath), "CommonDropdown.tsx must exist");
  assert.ok(fs.existsSync(stylesPath), "common-dropdown.css must exist");

  const componentContent = fs.readFileSync(componentPath, "utf8");
  assert.ok(
    componentContent.includes("export function CommonDropdown"),
    "CommonDropdown must be exported",
  );
  assert.ok(
    componentContent.includes("export const CommonSelect = CommonDropdown"),
    "CommonSelect alias must be exported",
  );
});

test("CommonDropdown adheres to 100% data-tooltip policy without native title", () => {
  const componentContent = fs.readFileSync(
    path.resolve("src/components/common/CommonDropdown.tsx"),
    "utf8",
  );

  // Split on <button occurrences and verify each has data-tooltip before its children
  const buttonBlocks = componentContent.split("<button").slice(1);
  assert.ok(
    buttonBlocks.length >= 2,
    "CommonDropdown must have at least trigger and option buttons",
  );

  for (const block of buttonBlocks) {
    const openingTag = block.slice(0, block.indexOf(">") !== -1 ? block.indexOf(">") : 500);
    // Include full attributes up to closing bracket of the tag
    const fullTag = block.slice(
      0,
      block.indexOf("</button>") !== -1 ? block.indexOf("</button>") : 500,
    );
    assert.ok(
      fullTag.includes("data-tooltip"),
      `Button in CommonDropdown must have data-tooltip attribute: ${openingTag}`,
    );
    assert.ok(
      !fullTag.includes(' title="') && !fullTag.includes(" title={"),
      `Button in CommonDropdown must not use native title: ${openingTag}`,
    );
  }
});

test("CommonDropdown implements accessible ARIA combobox/listbox pattern", () => {
  const componentContent = fs.readFileSync(
    path.resolve("src/components/common/CommonDropdown.tsx"),
    "utf8",
  );

  assert.ok(
    componentContent.includes('aria-haspopup="listbox"'),
    "Trigger button must declare aria-haspopup='listbox'",
  );
  assert.ok(
    componentContent.includes("aria-expanded={isOpen}"),
    "Trigger button must bind aria-expanded",
  );
  assert.ok(
    componentContent.includes('role="listbox"'),
    "Dropdown menu container must have role='listbox'",
  );
  assert.ok(
    componentContent.includes('role="option"'),
    "Dropdown item buttons must have role='option'",
  );
  assert.ok(
    componentContent.includes("aria-selected={isSelected}"),
    "Dropdown item buttons must declare aria-selected",
  );
});

test("CliPoolModal uses CommonDropdown and removes native select", () => {
  const modalContent = fs.readFileSync(
    path.resolve("src/components/common/CliPoolModal.tsx"),
    "utf8",
  );

  assert.ok(
    modalContent.includes("CommonDropdown"),
    "CliPoolModal must import and render CommonDropdown",
  );
  assert.ok(
    !modalContent.includes("<select"),
    "CliPoolModal must not use native <select> elements",
  );
});

test("Portaled dropdown outer width and each option height follow the trigger", () => {
  const tsx = fs.readFileSync(path.resolve("src/components/common/CommonDropdown.tsx"), "utf8");
  const css = fs.readFileSync(path.resolve("src/styles/common/common-dropdown.css"), "utf8");
  assert.match(tsx, /getBoundingClientRect\(\)/);
  assert.match(tsx, /const width = Math\.min\(rect\.width,/);
  assert.match(tsx, /"--common-dropdown-option-height"/);
  assert.match(css, /\.common-dropdown-menu\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(css, /\.common-dropdown-menu\s*\{[^}]*min-width:\s*0/s);
  assert.match(css, /\.common-dropdown-item\s*\{[^}]*box-sizing:\s*border-box/s);
  assert.match(
    css,
    /\.common-dropdown-item\s*\{[^}]*min-height:\s*var\(--common-dropdown-option-height/s,
  );
  assert.match(css, /\.common-dropdown-item\s*\{[^}]*min-width:\s*0/s);
});
