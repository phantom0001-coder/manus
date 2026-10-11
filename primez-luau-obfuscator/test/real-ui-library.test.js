import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const project = resolve(testDir, '..');
const source = resolve(testDir, 'fixtures', 'real-ui-library.lua');
const output = resolve(project, '.audit-real-ui-protected.luau');
const cli = resolve(project, 'dist', 'cli.js');

function run(command, args) {
  return execFileSync(command, args, { cwd: project, encoding: 'utf8' });
}

test('real Roblox UI library parses and builds without corrupting Luau', async () => {
  const inspect = run(process.execPath, [cli, 'inspect', source]);
  assert.match(inspect, /compatibility: (DYNAMIC|SUPPORTED-SAFE)/);
  run(process.execPath, [cli, 'build', source, output, '--profile', 'balanced', '--seed', '9001']);
  const protectedSource = await readFile(output, 'utf8');
  assert.ok(protectedSource.length > 0);
  assert.match(protectedSource, /function/);
  await rm(output, { force: true });
});
