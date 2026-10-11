import fs from 'fs'
import { execSync } from 'child_process'
import { luauparser } from '../dist/index.js'

const exampleScript = fs.readFileSync('./scripts/example.luau', 'utf-8')

const program = luauparser.parse(exampleScript)
fs.writeFileSync('./generated/ast.json', JSON.stringify(program, null, 4))

const code = luauparser.print(program)
fs.writeFileSync('./generated/final.luau', code)

const analysis = luauparser.analyzeScopes(program, {
    builtinGlobals: [
        'game', 'script', 'workspace', 'print', 'warn', 'error',
        'pairs', 'ipairs', 'next', 'type', 'typeof', 'tostring', 'tonumber',
        'require', 'unpack', 'select', 'assert', 'pcall', 'xpcall',
        'table', 'string', 'math', 'os', 'coroutine', 'task', 'Instance',
        'Vector3', 'CFrame', 'Color3', 'UDim2', 'Enum',
    ],
})

const bindingsSummary = [...analysis.bindings.values()].map(b => ({
    id: b.id,
    name: b.name,
    kind: b.kind,
    isBuiltin: !!b.isBuiltin,
    declaredAt: b.declarationNode
        ? { line: b.declarationNode.line.start, column: b.declarationNode.column.start }
        : null,
    referenceCount: b.references.length,
    referenceLocations: b.references.map(r => ({ line: r.line.start, column: r.column.start })),
}))

fs.writeFileSync('./generated/bindings.json', JSON.stringify(bindingsSummary, null, 4))

const suspiciousGlobals = [...analysis.bindings.values()]
    .filter(luauparser.isUnassignedGlobal)
    .map(b => b.name)

if (suspiciousGlobals.length > 0) {
    console.log('possibly-undefined globals:', suspiciousGlobals)
}