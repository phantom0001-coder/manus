import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const project = resolve(testDir, '..');
const fixture = resolve(project, 'examples', 'ui-sample.luau');
const shim = resolve(testDir, 'roblox-host-shim.luau');
const cli = resolve(project, 'dist', 'cli.js');
const protectedFile = resolve(project, '.host-protected.luau');
const originalHosted = resolve(project, '.host-original-hosted.luau');
const protectedHosted = resolve(project, '.host-protected-hosted.luau');
const luau = process.env.LUAU_BIN;

test('original and protected fixtures execute under the same Roblox host shim', async (t) => {
  if (!luau) {
    t.skip('set LUAU_BIN to run native Luau execution tests');
    return;
  }
  execFileSync(process.execPath, [cli, 'build', fixture, protectedFile, '--profile', 'balanced', '--seed', '9001'], { cwd: project });
  const shimSource = await readFile(shim, 'utf8');
  await writeFile(originalHosted, `${shimSource}\n${await readFile(fixture, 'utf8')}`);
  await writeFile(protectedHosted, `${shimSource}\n${await readFile(protectedFile, 'utf8')}`);
  const original = execFileSync(luau, [originalHosted], { encoding: 'utf8' });
  const protectedOutput = execFileSync(luau, [protectedHosted], { encoding: 'utf8' });
  assert.equal(protectedOutput, original);
  await Promise.all([protectedFile, originalHosted, protectedHosted].map((path) => rm(path, { force: true })));
});
