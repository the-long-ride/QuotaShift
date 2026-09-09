import { readdirSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const build = join(root, ".test-build");
if (dirname(build) !== root) throw new Error("Invalid test output directory");
rmSync(build, { recursive: true, force: true });
const require = createRequire(import.meta.url);
const sources = readdirSync(join(root, "src", "utils"))
  .filter((name) => name.endsWith(".ts"))
  .map((name) => join(root, "src", "utils", name));
const compiled = spawnSync(process.execPath, [
  require.resolve("typescript/bin/tsc"), ...sources,
  "--outDir", build, "--module", "ES2022", "--target", "ES2022",
  "--moduleResolution", "bundler", "--skipLibCheck",
], { cwd: root, stdio: "inherit" });
if (compiled.error) throw compiled.error;
if (compiled.status !== 0) process.exit(compiled.status ?? 1);
const tests = readdirSync(join(root, "tests"))
  .filter((name) => name.endsWith(".test.mjs"))
  .map((name) => join(root, "tests", name));
const tested = spawnSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "inherit" });
if (tested.error) throw tested.error;
process.exit(tested.status ?? 1);
