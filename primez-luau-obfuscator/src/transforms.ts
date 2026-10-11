import type { Program } from 'luau-parser';
import { getScopeAnalysis } from './frontend.js';

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

export interface TransformResult {
  program: Program;
  renamed: number;
  skipped: string[];
}

export function applySafeTransforms(program: Program, seed: number): TransformResult {
  const renamed = manglePrivateBindings(program, seed);
  return {
    program,
    renamed,
    skipped: ['string encoding', 'control-flow flattening', 'VM lowering'],
  };
}
