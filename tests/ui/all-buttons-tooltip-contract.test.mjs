import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function walkTsxFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walkTsxFiles(fullPath));
    } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
      results.push(fullPath);
    }
  }
  return results;
}

test("all buttons across the app must have data-tooltip and must not contain native title attribute", () => {
  const files = walkTsxFiles("src");
  const buttonsWithTitle = [];
  const buttonsMissingTooltip = [];
  let totalButtons = 0;

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    const sf = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

    function visit(node) {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        if (node.tagName.getText(sf) === "button") {
          totalButtons++;
          let hasTitle = false;
          let hasTooltip = false;
          let titleVal = "";

          node.attributes.properties.forEach((attr) => {
            if (ts.isJsxAttribute(attr)) {
              const name = attr.name.getText(sf);
              if (name === "title") {
                hasTitle = true;
                titleVal = attr.initializer ? attr.initializer.getText(sf) : "true";
              }
              if (name === "data-tooltip") {
                hasTooltip = true;
              }
            }
          });

          const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
          const lineNum = line + 1;

          if (hasTitle) {
            buttonsWithTitle.push({ file, line: lineNum, titleVal });
          }
          if (!hasTooltip) {
            buttonsMissingTooltip.push({
              file,
              line: lineNum,
              text: node.getText(sf).slice(0, 60),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }

    visit(sf);
  }

  assert.ok(totalButtons > 100, `Expected over 100 buttons across the app, found ${totalButtons}`);
  assert.deepEqual(
    buttonsWithTitle,
    [],
    `Found buttons with native title attribute (should use data-tooltip instead):\n` +
      buttonsWithTitle.map((b) => `${b.file}:${b.line} -> title=${b.titleVal}`).join("\n"),
  );
  assert.deepEqual(
    buttonsMissingTooltip,
    [],
    `Found buttons missing data-tooltip attribute:\n` +
      buttonsMissingTooltip.map((b) => `${b.file}:${b.line} -> ${b.text}`).join("\n"),
  );
});
