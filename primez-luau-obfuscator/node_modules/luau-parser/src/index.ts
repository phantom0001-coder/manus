import { parse, parseTokens, parseExpressionFromSource, ParseError } from '@ast/builders'
import { tokenize, LexError } from '@lexer/lexer'
import { print } from '@ast/printer'

// Re-export every AST/token type so consumers can `import type { ... } from "luau-parser"`.
export * from '@lexer/token'
export * from '@ast/nodes'
export type { PrintOptions } from '@ast/printer'
import { analyzeScopes, getBinding, isGlobal, isUnassignedGlobal } from '@ast/analyzeScopes'
export type { ScopeAnalysis, Binding, BindingId, BindingKind } from '@ast/analyzeScopes'

// Re-export the underlying functions/classes individually too, for consumers
// who prefer named imports over the `luauparser` namespace object.
export {
    tokenize, LexError,
    parse, parseTokens, parseExpressionFromSource, ParseError,
    print,
    analyzeScopes, getBinding, isGlobal, isUnassignedGlobal,
}

export const luauparser = {
    tokenize,
    parseTokens,
    parse,
    parseExpressionFromSource,
    print,
    analyzeScopes,
    getBinding,
    isGlobal,
    isUnassignedGlobal
} as const

export default luauparser