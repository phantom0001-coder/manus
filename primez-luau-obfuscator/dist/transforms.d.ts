import { type Program } from 'luau-parser';
import type { TransformProfile } from './types.js';
export declare function manglePrivateBindings(program: Program, seed: number): number;
export interface TransformResult {
    program: Program;
    renamed: number;
    encodedStrings: number;
    prelude: string;
    skipped: string[];
}
export declare function applySafeTransforms(program: Program, seed: number, profile?: TransformProfile): TransformResult;
