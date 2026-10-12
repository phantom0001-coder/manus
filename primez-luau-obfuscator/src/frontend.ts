import { analyzeScopes, parse, print, type Node, type Program } from 'luau-parser';
import { ROBLOX_BUILTINS } from './profile.js';
import type { CompatibilityFinding, CompatibilityReport } from './types.js';

const DYNAMIC_GLOBALS = new Set([
  'loadstring', 'load', 'getfenv', 'setfenv', 'getgenv', 'getrenv',
  'identifyexecutor', 'hookfunction', 'hookmetamethod', 'newcclosure', 'clonefunction',
  'setclipboard', 'toclipboard', 'writeclipboard', 'write_clipboard', 'gethui',
  'cloneref', 'request', 'http_request', 'getcustomasset', 'firesignal',
  'newcclosure', 'hookfunction', 'hookmetamethod', 'getrawmetatable', 'setreadonly',
  'make_readonly', 'make_writeable', 'queue_on_teleport', 'queueonteleport',
  'fireclickdetector', 'fireproximityprompt', 'firetouchinterest', 'getconnections',
  'getcallingscript', 'getscriptclosure', 'getgc', 'getreg', 'getinstances',
  'getnilinstances', 'getloadedmodules', 'Drawing', 'debug',
]);

const UNSUPPORTED_MARKERS = ['__namecall', 'syn.', 'KRNL', 'Celery', 'Drawing'];
const DYNAMIC_SOURCE_PATTERNS: Array<[RegExp, string, string]> = [
  [/\bgame\s*:\s*HttpGet(?:Async)?\s*\(/, 'game:HttpGet', 'Remote source loading must remain on the unchanged compatibility path.'],
  [/\bloadstring\s*\(/, 'loadstring', 'Runtime compilation cannot be safely analyzed or virtualized.'],
  [/\bgetfenv\s*\(|\bsetfenv\s*\(/, 'environment access', 'Environment introspection can observe transformed names and must remain unchanged.'],
  [/\b(?:request|http_request|syn\.request)\s*\(/, 'executor HTTP request', 'Executor HTTP APIs require unchanged source semantics.'],
  [/\bDrawing\s*\.\s*new\s*\(/, 'Drawing API', 'Executor Drawing userdata must remain outside AST transforms.'],
];

export function parseLuau(source: string): Program {
  return parse(source);
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string' && 'line' in record) visit(record as unknown as Node);
  for (const [key, child] of Object.entries(record)) {
    if (key === 'line' || key === 'column') continue;
    walk(child, visit);
  }
}

export function classifyCompatibility(source: string, program: Program): CompatibilityReport {
  const findings: CompatibilityFinding[] = [];
  const add = (status: CompatibilityFinding['status'], feature: string, message: string, line?: number) =>
    findings.push({ status, feature, message, line });

  if (/^\s*--!strict/m.test(source) || /^\s*--!nonstrict/m.test(source)) {
    add('SUPPORTED-SAFE', 'Luau directives', 'File directive detected; it will be preserved outside the AST printer.');
  }

  walk(program, (node) => {
    if (node.type === 'Identifier' && DYNAMIC_GLOBALS.has((node as { name: string }).name)) {
      add('DYNAMIC', (node as { name: string }).name, 'Dynamic or executor-specific environment behavior requires safe fallback.', node.line.start);
    }
  });

  for (const marker of UNSUPPORTED_MARKERS) {
    if (source.includes(marker)) add('SUPPORTED-SAFE', marker, 'Pattern detected; aggressive transforms should be disabled for this file.');
  }
  for (const [pattern, feature, message] of DYNAMIC_SOURCE_PATTERNS) {
    if (pattern.test(source)) add('DYNAMIC', feature, message);
  }

  const status = findings.some((f) => f.status === 'UNSUPPORTED')
    ? 'UNSUPPORTED'
    : findings.some((f) => f.status === 'DYNAMIC')
      ? 'DYNAMIC'
      : findings.some((f) => f.status === 'SUPPORTED-SAFE')
        ? 'SUPPORTED-SAFE'
        : 'SUPPORTED';

  return {
    status,
    findings,
    supportedTransforms: ['scope-aware identifier mangling', 'balanced string encoding', 'Luau AST round-trip'],
    skippedTransforms: ['control-flow flattening', 'VM lowering'],
  };
}

export function getScopeAnalysis(program: Program) {
  return analyzeScopes(program, { builtinGlobals: ROBLOX_BUILTINS });
}

export function renderLuau(program: Program, directives: string[], prelude = ''): string {
  const body = print(program);
  const header = directives.length ? `${directives.join('\n')}\n` : '';
  return `${header}${prelude}${body}\n`;
}

export function extractDirectives(source: string): string[] {
  return source.split(/\r?\n/).filter((line) => /^\s*--!/.test(line));
}
