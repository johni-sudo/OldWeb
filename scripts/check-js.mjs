import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const roots = ['public/assets/js', 'src', 'functions', 'scripts', 'tests'];
const skip = new Set(['node_modules', '.local', '.wrangler', '.pnpm-store', '.git']);
const files = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (skip.has(entry.name)) continue;
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.isFile() && /\.(m?js)$/.test(entry.name)) files.push(full);
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}

let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) {
    failed += 1;
    console.error(`\n✖ ${file}\n${result.stderr || result.stdout}`);
  }
}

if (failed) {
  console.error(`\nSyntax check failed in ${failed} file(s).`);
  process.exitCode = 1;
} else {
  console.log(`Syntax check passed: ${files.length} JavaScript modules.`);
}
