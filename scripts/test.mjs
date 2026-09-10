import { readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, ".test-build");
if (dirname(build) !== root) throw new Error("Invalid test output directory");
rmSync(build, { recursive: true, force: true });
const require = createRequire(import.meta.url);

function findSources(dir) {
  let results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findSources(full));
    } else if ((entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) && !entry.name.endsWith(".d.ts")) {
      results.push(full);
    }
  }
  return results;
}

const sources = findSources(join(root, "src", "utils"));
const compiled = spawnSync(process.execPath, [
  require.resolve("typescript/bin/tsc"), ...sources,
  "--outDir", build, "--rootDir", join(root, "src", "utils"),
  "--module", "ES2022", "--target", "ES2022", "--jsx", "react-jsx",
  "--moduleResolution", "bundler", "--skipLibCheck",
], { cwd: root, stdio: "inherit" });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);

function createShims(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      createShims(full);
    } else if (entry.name.endsWith(".js") && full !== join(build, entry.name)) {
      const shimPath = join(build, entry.name);
      if (!existsSync(shimPath)) {
        const rel = "./" + relative(build, full).replace(/\\/g, "/");
        writeFileSync(shimPath, `export * from "${rel}";\n`);
      }
    }
  }
}
createShims(build);
const tests = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => join(root, "tests", name));
const tested = spawnSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit" });
if (tested.error) throw tested.error;
process.exit(tested.status ?? 1);
