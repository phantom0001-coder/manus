import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const root = new URL('../', import.meta.url);
const cli = new URL('dist/cli.js', root);
const fixture = new URL('examples/ui-sample.luau', root);
const arithmeticFixture = new URL('examples/pure-arithmetic.luau', root);
const executorFixture = new URL('examples/executor-apis.luau', root);
const executorMatrixFixture = new URL('examples/executor-matrix.luau', root);
const luauSyntaxFixture = new URL('examples/luau-syntax.luau', root);
const bundleManifest = new URL('examples/bundle-fixture/manifest.json', root);
const bundleOutput = new URL('.bundle-test/', root);
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

test('preserves Luau directives, types, annotations, varargs, and if-expressions', async () => {
  execFileSync(process.execPath, [cli.pathname, 'build', luauSyntaxFixture.pathname, output.pathname, '--profile', 'balanced', '--seed', '123'], { encoding: 'utf8' });
  const protectedSource = await readFile(output, 'utf8');
  assert.match(protectedSource, /^--!strict/);
  assert.match(protectedSource, /type Pair/);
  assert.match(protectedSource, /: number/);
  assert.match(protectedSource, /\.\.\./);
  assert.match(protectedSource, /if .* then .* else/);
  await rm(output, { force: true });
});

test('bundles static relative modules without encoding require specifiers', async () => {
  await mkdir(bundleOutput, { recursive: true });
  const result = execFileSync(process.execPath, [cli.pathname, 'bundle', bundleManifest.pathname, bundleOutput.pathname], { encoding: 'utf8' });
  assert.match(result, /bundled 2 module\(s\)/);
  assert.match(result, /unresolved modules: none/);
  const bundledEntry = await readFile(new URL('main.luau', bundleOutput), 'utf8');
  const bundledHelper = await readFile(new URL('helper.luau', bundleOutput), 'utf8');
  assert.match(bundledEntry, /require\("\.\/helper"\)/);
  assert.match(bundledHelper, /return/);
  await rm(bundleOutput, { recursive: true, force: true });
});

test('VM candidate analysis is conservative around Roblox-boundary calls', () => {
  const result = execFileSync(process.execPath, [cli.pathname, 'build', arithmeticFixture.pathname, output.pathname, '--profile', 'safe', '--seed', '42'], { encoding: 'utf8' });
  assert.match(result, /VM candidates: 1/);
});

test('executor APIs are classified as dynamic and are not renamed as locals', () => {
  const result = execFileSync(process.execPath, [cli.pathname, 'inspect', executorFixture.pathname], { encoding: 'utf8' });
  assert.match(result, /compatibility: DYNAMIC/);
  assert.match(result, /identifyexecutor/);
  assert.match(result, /loadstring/);
  assert.match(result, /gethui/);
});

test('expanded executor matrix remains outside VM lowering', () => {
  const result = execFileSync(process.execPath, [cli.pathname, 'build', executorMatrixFixture.pathname, output.pathname, '--profile', 'balanced', '--seed', '777'], { encoding: 'utf8' });
  assert.match(result, /compatibility: DYNAMIC/);
  assert.match(result, /VM candidates: 0/);
  assert.match(result, /hookmetamethod/);
  assert.match(result, /Drawing/);
});
