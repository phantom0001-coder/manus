import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const project = resolve(import.meta.dirname, '..');
const cli = resolve(project, 'dist', 'cli.js');
const luau = process.env.LUAU_BIN;

const source = `local function calculateReward(level, streak, bonus)
  return (level * 100) + (streak * 25) + bonus
end
local reward = calculateReward(7, 4, 60)
print("Reward:", reward)
`;

test('red-team gate preserves behavior while removing obvious source markers', async (t) => {
  if (!luau) {
    t.skip('set LUAU_BIN to run the red-team runtime gate');
    return;
  }
  const dir = await mkdtemp(resolve(tmpdir(), 'primez-gate-'));
  const input = resolve(dir, 'input.luau');
  const outA = resolve(dir, 'a.luau');
  const outB = resolve(dir, 'b.luau');
  await writeFile(input, source);
  try {
    execFileSync(process.execPath, [cli, 'build', input, outA, '--profile', 'balanced', '--seed', '20261118'], { cwd: project });
    execFileSync(process.execPath, [cli, 'build', input, outB, '--profile', 'balanced', '--seed', '20261119'], { cwd: project });
    const [protectedA, protectedB] = await Promise.all([readFile(outA, 'utf8'), readFile(outB, 'utf8')]);
    assert.doesNotMatch(protectedA, /calculateReward|level|streak|bonus|Reward:/);
    assert.doesNotMatch(protectedA, /bit32\.bxor|__p_decode/);
    assert.notEqual(protectedA, protectedB, 'different seeds must produce different protected artifacts');
    const original = execFileSync(luau, [input], { encoding: 'utf8' });
    const outputA = execFileSync(luau, [outA], { encoding: 'utf8' });
    const outputB = execFileSync(luau, [outB], { encoding: 'utf8' });
    assert.equal(outputA, original);
    assert.equal(outputB, original);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
