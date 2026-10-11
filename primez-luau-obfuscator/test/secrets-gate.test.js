import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const cli = resolve(project, 'dist', 'cli.js');

test('default client builds accept all source; strict secret scanning is opt-in', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'primez-secret-'));
  const input = resolve(dir, 'secret.luau');
  const output = resolve(dir, 'out.luau');
  await writeFile(input, 'local api_key = "sk-123456789012345678901234567890"\nprint(api_key)\n');
  try {
    assert.doesNotThrow(() => execFileSync(process.execPath, [cli, 'build', input, output], { cwd: project, encoding: 'utf8', stdio: 'pipe' }));
    assert.throws(() => execFileSync(process.execPath, [cli, 'build', input, output, '--strict-secrets'], { cwd: project, encoding: 'utf8', stdio: 'pipe' }), /refusing to build client artifact/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
