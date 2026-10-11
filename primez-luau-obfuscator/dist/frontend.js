import { analyzeScopes, parse, print } from 'luau-parser';
import { ROBLOX_BUILTINS } from './profile.js';
const DYNAMIC_GLOBALS = new Set([
    'loadstring', 'load', 'getfenv', 'setfenv', 'getgenv', 'getrenv',
    'identifyexecutor', 'hookfunction', 'hookmetamethod', 'newcclosure', 'clonefunction',
    'setclipboard', 'toclipboard', 'writeclipboard', 'write_clipboard', 'gethui',
    'cloneref', 'request', 'http_request', 'getcustomasset', 'firesignal',
]);
const UNSUPPORTED_MARKERS = ['__namecall', 'syn.', 'KRNL', 'Celery', 'Drawing'];
export function parseLuau(source) {
    return parse(source);
}
function walk(value, visit) {
    if (!value || typeof value !== 'object')
        return;
    if (Array.isArray(value)) {
        for (const item of value)
            walk(item, visit);
        return;
    }
    const record = value;
    if (typeof record.type === 'string' && 'line' in record)
        visit(record);
    for (const [key, child] of Object.entries(record)) {
        if (key === 'line' || key === 'column')
            continue;
        walk(child, visit);
    }
}
export function classifyCompatibility(source, program) {
    const findings = [];
    const add = (status, feature, message, line) => findings.push({ status, feature, message, line });
    if (/^\s*--!strict/m.test(source) || /^\s*--!nonstrict/m.test(source)) {
        add('SUPPORTED-SAFE', 'Luau directives', 'File directive detected; it will be preserved outside the AST printer.');
    }
    walk(program, (node) => {
        if (node.type === 'Identifier' && DYNAMIC_GLOBALS.has(node.name)) {
            add('DYNAMIC', node.name, 'Dynamic or executor-specific environment behavior requires safe fallback.', node.line.start);
        }
    });
    for (const marker of UNSUPPORTED_MARKERS) {
        if (source.includes(marker))
            add('SUPPORTED-SAFE', marker, 'Pattern detected; aggressive transforms should be disabled for this file.');
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
export function getScopeAnalysis(program) {
    return analyzeScopes(program, { builtinGlobals: ROBLOX_BUILTINS });
}
export function renderLuau(program, directives, prelude = '') {
    const body = print(program);
    const header = directives.length ? `${directives.join('\n')}\n` : '';
    return `${header}${prelude}${body}\n`;
}
export function extractDirectives(source) {
    return source.split(/\r?\n/).filter((line) => /^\s*--!/.test(line));
}
