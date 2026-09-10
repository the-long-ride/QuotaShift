import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export function readWithCssImports(filePath) {
  let target;
  if (filePath instanceof URL) {
    target = filePath;
  } else if (typeof filePath === "string") {
    if (filePath.startsWith("file:")) {
      target = new URL(filePath);
    } else if (path.isAbsolute(filePath)) {
      target = pathToFileURL(filePath);
    } else {
      target = new URL(`../${filePath.replace(/\\/g, "/")}`, import.meta.url);
    }
  } else {
    target = filePath;
  }
  const content = fs.readFileSync(target, "utf8");
  return content.replace(/@import\s+["']([^"']+)["'];/g, (_, relPath) => {
    const resolved = new URL(relPath, target);
    return readWithCssImports(resolved);
  });
}
