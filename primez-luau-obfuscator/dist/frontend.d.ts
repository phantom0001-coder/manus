import { type Program } from 'luau-parser';
import type { CompatibilityReport } from './types.js';
export declare function parseLuau(source: string): Program;
export declare function classifyCompatibility(source: string, program: Program): CompatibilityReport;
export declare function getScopeAnalysis(program: Program): import("luau-parser").ScopeAnalysis;
export declare function renderLuau(program: Program, directives: string[], prelude?: string): string;
export declare function extractDirectives(source: string): string[];
