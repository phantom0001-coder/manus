import { parseExpressionFromSource, type Program } from 'luau-parser';
import { getScopeAnalysis } from './frontend.js';
import type { TransformProfile } from './types.js';
import { findVmCandidates } from './vm-candidates.js';
import { lowerVmCandidates } from './vm-lower.js';

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

function rewriteStrings(value: unknown, key: number, step: number, decoder: string, state: { count: number }, preserveString = false): number {
  if (!value || typeof value !== 'object') return 0;
  if (Array.isArray(value)) {
    let count = 0;
    for (let index = 0; index < value.length; index += 1) {
      const item = value[index] as { type?: string; value?: string } | undefined;
      if (item?.type === 'StringLiteral' && !preserveString) {
        const itemKey = (key + state.count * 17) % 251;
        const itemStep = ((step + state.count * 3) % 31) + 5;
        const bytes = [...Buffer.from(item.value ?? '', 'utf8')].map((byte, offset) => (byte + itemKey + offset * itemStep) % 256);
        value[index] = parseExpressionFromSource(`${decoder}({${bytes.join(',')}},${itemKey},${itemStep})`);
        state.count += 1;
        count += 1;
      } else {
        count += rewriteStrings(item, key, step, decoder, state, preserveString);
      }
    }
    return count;
  }

  const node = value as Record<string, unknown>;
  if (node.type === 'StringLiteral') return 0;
  let count = 0;
  const isRequireCall = node.type === 'CallExpression'
    && (node.callee as { type?: string; name?: string } | undefined)?.type === 'Identifier'
    && (node.callee as { name?: string }).name === 'require';
  for (const [name, child] of Object.entries(node)) {
    if (name === 'line' || name === 'column') continue;
    const item = child as { type?: string; value?: string } | undefined;
    if (item?.type === 'StringLiteral' && !(isRequireCall && name === 'arguments')) {
      const itemKey = (key + state.count * 17) % 251;
      const itemStep = ((step + state.count * 3) % 31) + 5;
      const bytes = [...Buffer.from(item.value ?? '', 'utf8')].map((byte, offset) => (byte + itemKey + offset * itemStep) % 256);
      node[name] = parseExpressionFromSource(`${decoder}({${bytes.join(',')}},${itemKey},${itemStep})`);
      state.count += 1;
      count += 1;
    } else {
      count += rewriteStrings(child, key, step, decoder, state, isRequireCall && name === 'arguments');
    }
  }
  return count;
}

const STRING_PRELUDE = (decoder: string) => `local ${decoder} = function(data, key, stride)
    local out = {}
    for i, byte in data do
        local value = byte - key - ((i - 1) * stride)
        while value < 0 do value += 256 end
        out[i] = string.char(value % 256)
    end
    return table.concat(out)
end
`;

export interface TransformResult {
  program: Program;
  renamed: number;
  encodedStrings: number;
  vmCandidates: number;
  vmLowered: number;
  prelude: string;
  skipped: string[];
}

export function applySafeTransforms(program: Program, seed: number, profile: TransformProfile = 'balanced'): TransformResult {
  const renamed = manglePrivateBindings(program, seed);
  const vmCandidates = findVmCandidates(program).length;
  const vm = profile === 'balanced' ? lowerVmCandidates(program, seed) : { lowered: 0, prelude: '' };
  const key = ((seed % 251) + 251) % 251 || 137;
  const step = ((Math.abs(seed * 7) % 31) + 5);
  const decoder = `__s_${Math.abs(seed * 131).toString(36)}`;
  const encodedStrings = profile === 'balanced' ? rewriteStrings(program, key, step, decoder, { count: 0 }) : 0;
  return {
    program,
    renamed,
    encodedStrings,
    vmCandidates,
    vmLowered: vm.lowered,
    prelude: `${vm.prelude}${encodedStrings ? STRING_PRELUDE(decoder) : ''}`,
    skipped: ['control-flow flattening'],
  };
}
