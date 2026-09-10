import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function runPrettier(args) {
  const prettierBin = require.resolve("prettier/bin/prettier.cjs");
  const isCheck = args.includes("--check");
  const filteredArgs = args.filter((a) => a !== "--check" && a !== "--write");

  const targets = filteredArgs.length > 0
    ? filteredArgs
    : ["src/**/*.{ts,tsx}", "vite.config.ts"];

  const prettierArgs = [
    prettierBin,
    isCheck ? "--check" : "--write",
    ...targets,
  ];

  console.log(`\n[1/2] Running Prettier on TS/TSX files (${isCheck ? "check" : "write"})...`);
  const result = spawnSync(process.execPath, prettierArgs, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });

  return result.status ?? 1;
}

function runCargoFmt(args) {
  const isCheck = args.includes("--check");
  const cargoArgs = [
    "fmt",
    "--manifest-path",
    "src-tauri/Cargo.toml",
  ];

  if (isCheck) {
    cargoArgs.push("--", "--check");
  }

  console.log(`\n[2/2] Running cargo fmt on Rust files (${isCheck ? "check" : "write"})...`);
  const result = spawnSync("cargo", cargoArgs, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.error) {
    console.error("Failed to execute cargo fmt:", result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

function main() {
  const args = process.argv.slice(2);
  const isCheck = args.includes("--check");

  console.log(`======================================================================`);
  console.log(`            Code Formatting: TypeScript, TSX & Rust                   `);
  console.log(`======================================================================`);
  console.log(`Mode: ${isCheck ? "Check only" : "Format in-place"}`);

  const prettierStatus = runPrettier(args);
  const cargoStatus = runCargoFmt(args);

  console.log("\n----------------------------------------------------------------------");
  const prettierOk = prettierStatus === 0;
  const cargoOk = cargoStatus === 0;

  console.log(`Prettier (TS/TSX) : ${prettierOk ? "PASSED" : "FAILED"}`);
  console.log(`Cargo fmt (Rust)  : ${cargoOk ? "PASSED" : "FAILED"}`);
  console.log("----------------------------------------------------------------------");

  if (!prettierOk || !cargoOk) {
    process.exit(1);
  } else {
    console.log(`All TS, TSX, and RS files are formatted cleanly!`);
    process.exit(0);
  }
}

main();
