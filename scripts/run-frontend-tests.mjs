import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { spawnSync } from 'node:child_process';

const repositoryRoot = process.cwd();
const frontendRoot = join(repositoryRoot, 'frontend');

function collectTestFiles(directory) {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) return collectTestFiles(fullPath);
      return entry.isFile() && entry.name.endsWith('.test.mjs') ? [fullPath] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

const testFiles = collectTestFiles(frontendRoot);
if (testFiles.length === 0) {
  console.error('No frontend test files were found under frontend/.');
  process.exit(1);
}

console.log(`Running ${testFiles.length} frontend test files...`);
const result = spawnSync(
  process.execPath,
  ['--test', ...testFiles.map((file) => relative(repositoryRoot, file).split(sep).join('/'))],
  { cwd: repositoryRoot, stdio: 'inherit' },
);

if (result.error) {
  console.error(`Unable to start the frontend test runner: ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
