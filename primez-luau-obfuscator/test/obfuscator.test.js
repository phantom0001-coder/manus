import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const cli = new URL('dist/cli.js', root);
const fixture = new URL('examples/ui-sample.luau', root);
const output = new URL('test-output.luau', root);

test('inspect reports a valid Luau UI-style fixture', () => {
  const result = execFileSync(process.execPath, [cli.pathname, 'inspect', fixture.pathname], { encoding: 'utf8' });
  assert.match(result, /compatibility: SUPPORTED-SAFE/);
  assert.match(result, /Luau directives/);
});

test('build is deterministic for a fixed seed and preserves strict directive', async () => {
  execFileSync(process.execPath, [cli.pathname, 'build', fixture.pathname, output.pathname, '--seed', '42'], { encoding: 'utf8' });
  const first = await readFile(output, 'utf8');
  execFileSync(process.execPath, [cli.pathname, 'build', fixture.pathname, output.pathname, '--seed', '42'], { encoding: 'utf8' });
  const second = await readFile(output, 'utf8');
  assert.equal(first, second);
  assert.match(first, /^--!strict/);
  assert.match(first, /Instance/);
  await rm(output, { force: true });
});
