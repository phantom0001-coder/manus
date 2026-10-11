import { parseExpressionFromSource, type Program } from 'luau-parser';
import { getScopeAnalysis } from './frontend.js';
import type { TransformProfile } from './types.js';

const PUBLIC_NAMES = new Set(['init', 'new', 'start', 'stop', 'Open', 'Close', 'Destroy', 'Connect']);

function nameFor(index: number, seed: number): string {
  return `_p${(seed + index * 7919).toString(36)}_${index.toString(36)}`;
}

export function manglePrivateBindings(program: Program, seed: number): number {
  const analysis = getScopeAnalysis(program);
  let index = 0;
  for (const binding of analysis.bindings.values()) {
    if (binding.kind === 'global' || binding.isBuiltin || !binding.declarationNode) continue;
    if (PUBLIC_NAMES.has(binding.name) || /^__/.test(binding.name)) continue;
    const next = nameFor(index++, seed);
    binding.declarationNode.name = next;
    for (const reference of binding.references) reference.name = next;
    binding.name = next;
  }
  return index;
}

function rewriteStrings(value: unknown, key: number): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index] as { type?: string; value?: string } | undefined;
      if (item?.type === 'StringLiteral') {
        const bytes = [...Buffer.from(item.value ?? '', 'utf8')];
        value[index] = parseExpressionFromSource(`__p_decode({${bytes.join(',')}},${key})`);
        count += 1;
      } else {
        count += rewriteStrings(item, key);
      }
    }
    return count;
  }

  const node = value as Record<string, unknown>;
  if (node.type === 'StringLiteral') return 0;
  let count = 0;
  for (const [name, child] of Object.entries(node)) {
    if (name === 'line' || name === 'column') continue;
    const item = child as { type?: string; value?: string } | undefined;
    if (item?.type === 'StringLiteral') {
      const bytes = [...Buffer.from(item.value ?? '', 'utf8')];
      node[name] = parseExpressionFromSource(`__p_decode({${bytes.join(',')}},${key})`);
      count += 1;
    } else {
      count += rewriteStrings(child, key);
    }
  }
  return count;
}

const STRING_PRELUDE = (key: number) => `local __p_decode = function(data, key)
    local out = {}
    for i, byte in data do out[i] = string.char(bit32.bxor(byte, key)) end
    return table.concat(out)
end
`;

export interface TransformResult {
  program: Program;
  renamed: number;
  encodedStrings: number;
  prelude: string;
  skipped: string[];
}

export function applySafeTransforms(program: Program, seed: number, profile: TransformProfile = 'balanced'): TransformResult {
  const renamed = manglePrivateBindings(program, seed);
  const key = ((seed % 251) + 251) % 251 || 137;
  const encodedStrings = profile === 'balanced' ? rewriteStrings(program, key) : 0;
  return {
    program,
    renamed,
    encodedStrings,
    prelude: encodedStrings ? STRING_PRELUDE(key) : '',
    skipped: ['control-flow flattening', 'VM lowering'],
  };
}
