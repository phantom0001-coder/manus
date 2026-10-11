import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { parse } from 'luau-parser';

const root = new URL('../', import.meta.url);
const work = new URL('.audit/', root);
const cli = new URL('dist/cli.js', root);

const cases = {
  uiSignals: `--!strict\nlocal state = { count = 0 }\nlocal function mount(parent: Instance)\n  local button = Instance.new("TextButton")\n  button.Parent = parent\n  local connection = button.Activated:Connect(function()\n    state.count += 1\n    print("clicked", state.count)\n  end)\n  return button, connection\nend\nreturn mount`,
  moduleGraph: `local HttpService = game:GetService("HttpService")\nlocal function encode(value) return HttpService:JSONEncode(value) end\nlocal function make() return { encode = encode } end\nreturn make`,
  metatables: `local methods = {}\nfunction methods:read() return self.value end\nlocal mt = { __index = methods }\nlocal function new(value) return setmetatable({ value = value }, mt) end\nreturn new`,
  loopsAndClosures: `local function build(limit)\n  local list = {}\n  for index = 1, limit do\n    list[index] = function() return index end\n  end\n  return list\nend\nreturn build`,
  luauTypes: `--!strict\ntype Entry = { name: string, count: number }\nlocal function add(entry: Entry, amount: number): number\n  entry.count += amount\n  return entry.count\nend\nreturn add`,
  dynamicFallback: `local function run(source: string)\n  if loadstring then return loadstring(source) end\n  return nil\nend\nreturn run`,
};

function deobfuscateNames(source) {
  const names = [...new Set(source.match(/\b_p[0-9a-z]+_[0-9a-z]+\b/g) ?? [])];
  const mapping = new Map(names.map((name, index) => [name, `recovered_${index}`]));
  let result = source;
  for (const [from, to] of mapping) result = result.replaceAll(from, to);
  return { source: result, mapping };
}

await mkdir(work, { recursive: true });
const results = [];
for (const [name, source] of Object.entries(cases)) {
  const input = new URL(`${name}.luau`, work);
  const output = new URL(`${name}.protected.luau`, work);
  await writeFile(input, source);
  const inspect = execFileSync(process.execPath, [cli.pathname, 'inspect', input.pathname], { encoding: 'utf8' });
  execFileSync(process.execPath, [cli.pathname, 'build', input.pathname, output.pathname, '--profile', 'balanced', '--seed', '9001'], { encoding: 'utf8' });
  const protectedSource = await readFile(output, 'utf8');
  parse(protectedSource);
  const recovered = deobfuscateNames(protectedSource);
  parse(recovered.source);
  results.push({
    name,
    parsedProtected: true,
    parsedAfterNameRecovery: true,
    renamedIdentifiers: recovered.mapping.size,
    compatibility: inspect.match(/compatibility: ([A-Z-]+)/)?.[1] ?? 'UNKNOWN',
    note: recovered.mapping.size ? 'identifier layer is trivially reversible by normalization' : 'no private identifiers transformed',
  });
}
console.log(JSON.stringify({ cases: results, conclusion: 'Current MVP survives parser-level corpus checks but identifier-only protection is trivially deobfuscated; VM/string/CFG layers are not production-ready.' }, null, 2));
await rm(work, { recursive: true, force: true });
