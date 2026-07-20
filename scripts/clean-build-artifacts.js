import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const modes = process.argv.slice(2);
const dryRun = modes.includes('--dry-run');
const effectiveModes = modes.filter(m => !m.startsWith('--'));

const targetDir = path.join(rootDir, 'src-tauri', 'target');
const distDir = path.join(rootDir, 'dist');

function removed(p, isDir = false) {
  if (dryRun) {
    console.log(`[dry-run] would remove ${isDir ? 'dir' : 'file'}: ${p}`);
    return;
  }
  if (isDir) {
    fs.rmSync(p, { recursive: true, force: true });
  } else {
    fs.unlinkSync(p);
  }
  console.log(`removed ${isDir ? 'dir' : 'file'}: ${p}`);
}

function keepRootFile(filename) {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);

  // Keep executable binaries (.exe on Windows, extensionless on Unix)
  if (ext === '.exe' || ext === '.pdb' || ext === '.dll' || ext === '.so' || ext === '.dylib') {
    return true;
  }

  // On Unix the binary often has no extension. Skip hidden/tooling files.
  if (ext === '' && !lower.startsWith('.')) {
    return true;
  }

  // Keep macOS debug symbol bundles
  if (lower.endsWith('.dsym')) {
    return true;
  }

  return false;
}

function cleanBuildDir(buildDir) {
  if (!fs.existsSync(buildDir)) {
    console.log(`directory does not exist: ${buildDir}`);
    return;
  }

  const entries = fs.readdirSync(buildDir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(buildDir, entry.name);

    if (entry.isDirectory()) {
      // Bundle output is already copied to root/release by copy-release.js
      if (entry.name === 'bundle') {
        removed(fullPath, true);
        continue;
      }

      removed(fullPath, true);
      continue;
    }

    if (keepRootFile(entry.name)) {
      console.log(`kept binary: ${fullPath}`);
      continue;
    }

    removed(fullPath, false);
  }
}

function cleanDist() {
  if (fs.existsSync(distDir)) {
    removed(distDir, true);
  }
}

if (effectiveModes.length === 0) {
  console.log('Usage: node scripts/clean-build-artifacts.js [release|dev|all] [--dry-run]');
  process.exit(0);
}

for (const mode of effectiveModes) {
  console.log(`\ncleaning artifacts for mode: ${mode}${dryRun ? ' (dry-run)' : ''}`);

  if (mode === 'release') {
    cleanBuildDir(path.join(targetDir, 'release'));
    cleanDist();
  } else if (mode === 'dev') {
    cleanBuildDir(path.join(targetDir, 'debug'));
  } else if (mode === 'all') {
    cleanBuildDir(path.join(targetDir, 'release'));
    cleanBuildDir(path.join(targetDir, 'debug'));
    cleanDist();
  } else {
    console.warn(`unknown mode: ${mode}`);
  }
}

console.log('\ncleanup complete.');
