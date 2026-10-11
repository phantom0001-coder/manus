import { tokenize, type Token } from "@lexer/lexer"
import type {
    Program, Block, Statement, Expression, TypeNode,
    LocalStatement, LocalFunctionStatement, FunctionDeclarationStatement,
    AssignmentStatement, CompoundAssignmentStatement, CallStatement,
    DoStatement, WhileStatement, RepeatStatement, IfStatement, IfClause,
    NumericForStatement, GenericForStatement, ReturnStatement,
    BreakStatement, ContinueStatement, TypeAliasStatement, ExportTypeAliasStatement,
    FunctionName, TypedIdentifier, GenericTypeParameter,
    Identifier, NilLiteral, BooleanLiteral, NumberLiteral, StringLiteral,
    InterpolatedStringExpression, InterpolatedStringPart, VarargExpression,
    FunctionExpression, FunctionBody, FunctionParameter,
    TableExpression, TableField,
    BinaryExpression, UnaryExpression, MemberExpression, IndexExpression,
    CallExpression, MethodCallExpression, ParenthesizedExpression,
    TypeAssertionExpression, IfElseExpression,
    TypeReference, TypeLiteralString, TypeLiteralBoolean, TableTypeNode,
    TableTypeProperty, FunctionTypeNode, FunctionTypeParameter,
    UnionTypeNode, IntersectionTypeNode, OptionalTypeNode,
    ParenthesizedTypeNode, TypeofTypeNode, VariadicTypeNode, TypePackNode,
} from "@ast/nodes"

export class ParseError extends Error {
    constructor(message: string, public line: number, public column: number) {
        super(`${message} (${line}:${column})`)
    }
}

// ------------------------------------------------------------
// Span helpers
// ------------------------------------------------------------

interface Span {
    line: { start: number; end: number }
    column: { start: number; end: number }
}

function spanFrom(start: Span, end: Span): Span {
    return {
        line: { start: start.line.start, end: end.line.end },
        column: { start: start.column.start, end: end.column.end },
    }
}

// ------------------------------------------------------------
// Operator precedence
// ------------------------------------------------------------

export const BINARY_PRECEDENCE: Record<string, number> = {
    "or": 1,
    "and": 2,
    "<": 3, ">": 3, "<=": 3, ">=": 3, "~=": 3, "==": 3,
    "..": 4,
    "+": 5, "-": 5,
    "*": 6, "/": 6, "//": 6, "%": 6,
    "^": 8,
}
export const RIGHT_ASSOCIATIVE = new Set(["..", "^"])
export const UNARY_PRECEDENCE = 7

export const COMPOUND_ASSIGN_OPS = new Set(["+=", "-=", "*=", "/=", "//=", "%=", "^=", "..="])

// ============================================================
// Parser
// ============================================================

export class Parser {
    private tokens: Token[]
    private cursor = 0

    constructor(tokens: Token[]) {
        this.tokens = tokens
    }

    private current(): Token {
        return this.tokens[this.cursor]
    }

    private peek(offset: number): Token {
        return this.tokens[Math.min(this.cursor + offset, this.tokens.length - 1)]
    }

    private previous(): Token {
        return this.tokens[this.cursor - 1]
    }

    private isAtEnd(): boolean {
        return this.current().type === "EOF"
    }

    private advance(): Token {
        const t = this.current()
        if (t.type !== "EOF") this.cursor++
        return t
    }

    private checkType(type: Token["type"]): boolean {
        return this.current().type === type
    }

    private checkKeyword(value: string): boolean {
        const t = this.current()
        return t.type === "Keyword" && (t as any).value === value
    }

    private checkOperator(value: string): boolean {
        const t = this.current()
        return t.type === "Operator" && (t as any).value === value
    }

    private checkPunctuator(value: string): boolean {
        const t = this.current()
        return t.type === "Punctuator" && (t as any).value === value
    }

    private checkIdentifierValue(value: string): boolean {
        const t = this.current()
        return t.type === "Identifier" && (t as any).value === value
    }

    private matchKeyword(value: string): boolean {
        if (this.checkKeyword(value)) { this.advance(); return true }
        return false
    }

    private matchOperator(value: string): boolean {
        if (this.checkOperator(value)) { this.advance(); return true }
        return false
    }

    private matchPunctuator(value: string): boolean {
        if (this.checkPunctuator(value)) { this.advance(); return true }
        return false
    }

    private expectKeyword(value: string): Token {
        if (!this.checkKeyword(value)) this.error(`Expected keyword '${value}'`)
        return this.advance()
    }

    private expectOperator(value: string): Token {
        if (!this.checkOperator(value)) this.error(`Expected '${value}'`)
        return this.advance()
    }

    private expectPunctuator(value: string): Token {
        if (!this.checkPunctuator(value)) this.error(`Expected '${value}'`)
        return this.advance()
    }

    private expectIdentifier(): Token & { value: string } {
        if (!this.checkType("Identifier")) this.error(`Expected identifier`)
        return this.advance() as Token & { value: string }
    }

    private error(message: string): never {
        const t = this.current()
        throw new ParseError(`${message}, got '${this.describeToken(t)}'`, t.line.start, t.column.start)
    }

    private describeToken(t: Token): string {
        if (t.type === "EOF") return "<eof>"
        if ("value" in t) return String((t as any).value)
        return t.type
    }

    // ============================================================
    // Entry point
    // ============================================================

    parseProgram(): Program {
        const start = this.current()
        const body = this.parseBlock()
        if (!this.isAtEnd()) {
            this.error("Expected end of file")
        }
        return { type: "Program", body, ...spanFrom(start, this.previous() ?? start) }
    }

    // ============================================================
    // Block / Statement
    // ============================================================

    private isBlockEnd(): boolean {
        return this.isAtEnd() ||
            this.checkKeyword("end") ||
            this.checkKeyword("else") ||
            this.checkKeyword("elseif") ||
            this.checkKeyword("until")
    }

    private parseBlock(): Block {
        const start = this.current()
        const statements: Statement[] = []
        while (!this.isBlockEnd()) {
            if (this.matchPunctuator(";")) continue
            const stmt = this.parseStatement()
            statements.push(stmt)
            if (stmt.type === "ReturnStatement") {
                this.matchPunctuator(";")
                break
            }
        }
        const end = this.previous() ?? start
        return { type: "Block", statements, ...spanFrom(start, end) }
    }

    private parseAttributes(): { attributes: string[]; start: Token } {
        const start = this.current()
        const attributes: string[] = []
        while (this.current().type === "Punctuator" && (this.current() as any).value === "@") {
            this.advance()
            attributes.push(this.expectIdentifier().value)
        }
        return { attributes, start }
    }

    private parseStatement(): Statement {
        const t = this.current()

        if (t.type === "Punctuator" && (t as any).value === "@") {
            const { attributes, start } = this.parseAttributes()
            const next = this.current()
            if (next.type === "Keyword" && (next as any).value === "local") {
                const stmt = this.parseLocalStatement()
                if (stmt.type === "LocalFunctionStatement") {
                    stmt.attributes = attributes
                    stmt.line.start = start.line.start
                    stmt.column.start = start.column.start
                }
                return stmt
            }
            if (next.type === "Keyword" && (next as any).value === "function") {
                const stmt = this.parseFunctionDeclarationStatement()
                stmt.attributes = attributes
                stmt.line.start = start.line.start
                stmt.column.start = start.column.start
                return stmt
            }
            if (next.type === "Identifier" && (next as any).value === "const" && this.isConstKeyword()) {
                const stmt = this.parseConstStatement()
                if (stmt.type === "LocalFunctionStatement") {
                    stmt.attributes = attributes
                    stmt.line.start = start.line.start
                    stmt.column.start = start.column.start
                }
                return stmt
            }
            throw new ParseError("Expected 'function' or 'local function' after attribute", next.line.start, next.column.start)
        }

        if (t.type === "Keyword") {
            switch ((t as any).value) {
                case "local": return this.parseLocalStatement()
                case "if": return this.parseIfStatement()
                case "while": return this.parseWhileStatement()
                case "repeat": return this.parseRepeatStatement()
                case "do": return this.parseDoStatement()
                case "for": return this.parseForStatement()
                case "function": return this.parseFunctionDeclarationStatement()
                case "return": return this.parseReturnStatement()
                case "break": {
                    this.advance()
                    return { type: "BreakStatement", ...spanFrom(t, this.previous()) } as BreakStatement
                }
                case "continue": {
                    this.advance()
                    return { type: "ContinueStatement", ...spanFrom(t, this.previous()) } as ContinueStatement
                }
            }
        }

        if (t.type === "Identifier" && (t as any).value === "const" && this.isConstKeyword()) {
            return this.parseConstStatement()
        }

        if (t.type === "Identifier" && (t as any).value === "export" &&
            this.peek(1).type === "Identifier" && (this.peek(1) as any).value === "type" &&
            this.peek(2).type === "Identifier") {
            return this.parseExportTypeAliasStatement()
        }

        if (t.type === "Identifier" && (t as any).value === "type" &&
            this.peek(1).type === "Identifier") {
            return this.parseTypeAliasStatement()
        }

        return this.parseExpressionStatement()
    }

    private parseLocalStatement(): LocalStatement | LocalFunctionStatement {
        const start = this.current()
        this.expectKeyword("local")

        if (this.matchKeyword("function")) {
            const name = this.parseIdentifier()
            const func = this.parseFunctionBody()
            return { type: "LocalFunctionStatement", name, func, ...spanFrom(start, this.previous()) }
        }

        const names = [this.parseTypedIdentifierWithAttributes()]
        while (this.matchPunctuator(",")) {
            names.push(this.parseTypedIdentifierWithAttributes())
        }

        let init: Expression[] = []
        if (this.matchOperator("=")) {
            init = this.parseExpressionList()
        }

        return { type: "LocalStatement", names, init, ...spanFrom(start, this.previous()) }
    }

    // `const` is a contextual keyword: it is only treated as the start of a
    // const-binding statement when it is immediately followed by an
    // identifier (the binding name) or the `function` keyword (const
    // function declaration). Otherwise `const` is a normal identifier,
    // preserving backwards compatibility with code that uses `const` as a
    // variable name.
    private isConstKeyword(): boolean {
        const next = this.peek(1)
        if (next.type === "Identifier") return true
        if (next.type === "Keyword" && (next as any).value === "function") return true
        return false
    }

    private parseConstStatement(): LocalStatement | LocalFunctionStatement {
        const start = this.current()
        this.advance() // consume 'const'

        if (this.matchKeyword("function")) {
            const name = this.parseIdentifier()
            const func = this.parseFunctionBody()
            return { type: "LocalFunctionStatement", name, func, isConst: true, ...spanFrom(start, this.previous()) }
        }

        const names = [this.parseTypedIdentifierWithAttributes()]
        while (this.matchPunctuator(",")) {
            names.push(this.parseTypedIdentifierWithAttributes())
        }

        let init: Expression[] = []
        if (this.matchOperator("=")) {
            init = this.parseExpressionList()
        }

        return { type: "LocalStatement", names, init, isConst: true, ...spanFrom(start, this.previous()) }
    }

    private parseTypedIdentifierWithAttributes(): TypedIdentifier {
        const nameTok = this.expectIdentifier()
        let typeAnnotation: TypeNode | undefined
        let attributes: string[] | undefined

        if (this.checkOperator("<")) {
            this.advance()
            attributes = []
            attributes.push(this.expectIdentifier().value as string)
            while (this.matchPunctuator(",")) {
                attributes.push(this.expectIdentifier().value as string)
            }
            this.expectOperator(">")
        }

        if (this.matchPunctuator(":")) {
            typeAnnotation = this.parseType()
        }

        return {
            type: "TypedIdentifier",
            name: nameTok.value as string,
            typeAnnotation,
            attributes,
            ...spanFrom(nameTok, this.previous()),
        }
    }

    private parseTypedIdentifier(): TypedIdentifier {
        const nameTok = this.expectIdentifier()
        let typeAnnotation: TypeNode | undefined
        if (this.matchPunctuator(":")) {
            typeAnnotation = this.parseType()
        }
        return {
            type: "TypedIdentifier",
            name: nameTok.value as string,
            typeAnnotation,
            ...spanFrom(nameTok, this.previous()),
        }
    }

    private parseIfStatement(): IfStatement {
        const start = this.current()
        this.expectKeyword("if")
        const clauses: IfClause[] = []

        const cond = this.parseExpression()
        this.expectKeyword("then")
        const body = this.parseBlock()
        clauses.push({ type: "IfClause", condition: cond, body, ...spanFrom(cond, this.previous()) })

        while (this.checkKeyword("elseif")) {
            const clauseStart = this.current()
            this.advance()
            const c = this.parseExpression()
            this.expectKeyword("then")
            const b = this.parseBlock()
            clauses.push({ type: "IfClause", condition: c, body: b, ...spanFrom(clauseStart, this.previous()) })
        }

        let alternate: Block | undefined
        if (this.matchKeyword("else")) {
            alternate = this.parseBlock()
        }

        this.expectKeyword("end")
        return { type: "IfStatement", clauses, alternate, ...spanFrom(start, this.previous()) }
    }

    private parseWhileStatement(): WhileStatement {
        const start = this.current()
        this.expectKeyword("while")
        const condition = this.parseExpression()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return { type: "WhileStatement", condition, body, ...spanFrom(start, this.previous()) }
    }

    private parseRepeatStatement(): RepeatStatement {
        const start = this.current()
        this.expectKeyword("repeat")
        const body = this.parseBlock()
        this.expectKeyword("until")
        const condition = this.parseExpression()
        return { type: "RepeatStatement", body, condition, ...spanFrom(start, this.previous()) }
    }

    private parseDoStatement(): DoStatement {
        const start = this.current()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return { type: "DoStatement", body, ...spanFrom(start, this.previous()) }
    }

    private parseForStatement(): NumericForStatement | GenericForStatement {
        const start = this.current()
        this.expectKeyword("for")

        const first = this.parseTypedIdentifier()

        if (this.matchOperator("=")) {
            const from = this.parseExpression()
            this.expectPunctuator(",")
            const to = this.parseExpression()
            let step: Expression | undefined
            if (this.matchPunctuator(",")) {
                step = this.parseExpression()
            }
            this.expectKeyword("do")
            const body = this.parseBlock()
            this.expectKeyword("end")
            return {
                type: "NumericForStatement",
                variable: first, start: from, end: to, step, body,
                ...spanFrom(start, this.previous()),
            }
        }

        const variables = [first]
        while (this.matchPunctuator(",")) {
            variables.push(this.parseTypedIdentifier())
        }
        this.expectKeyword("in")
        const iterators = this.parseExpressionList()
        this.expectKeyword("do")
        const body = this.parseBlock()
        this.expectKeyword("end")
        return {
            type: "GenericForStatement",
            variables, iterators, body,
            ...spanFrom(start, this.previous()),
        }
    }

    private parseFunctionDeclarationStatement(): FunctionDeclarationStatement {
        const start = this.current()
        this.expectKeyword("function")
        const target = this.parseFunctionName()
        const isMethod = target.method !== undefined
        const func = this.parseFunctionBody()

        if (isMethod) {
            func.params.unshift({
                type: "FunctionParameter",
                name: "self",
                ...spanFrom(target, target),
            })
        }

        return { type: "FunctionDeclarationStatement", target, isMethod, func, ...spanFrom(start, this.previous()) }
    }

    private parseFunctionName(): FunctionName {
        const start = this.current()
        const base = this.parseIdentifier()
        const path: Identifier[] = []
        while (this.checkPunctuator(".")) {
            this.advance()
            path.push(this.parseIdentifier())
        }
        let method: Identifier | undefined
        if (this.matchPunctuator(":")) {
            method = this.parseIdentifier()
        }
        return { type: "FunctionName", base, path, method, ...spanFrom(start, this.previous()) }
    }

    private isExpressionStart(): boolean {
        const t = this.current()
        if (t.type === "Literal" || t.type === "InterpolatedString" || t.type === "Identifier") return true
        if (t.type === "Keyword") {
            return ["function", "if", "not", "nil", "true", "false"].includes((t as any).value)
        }
        if (t.type === "Operator") {
            return ["...", "-", "#"].includes((t as any).value)
        }
        if (t.type === "Punctuator") {
            return (t as any).value === "(" || (t as any).value === "{"
        }
        return false
    }

    private parseReturnStatement(): ReturnStatement {
        const start = this.current()
        this.expectKeyword("return")
        let args: Expression[] = []
        if (this.isExpressionStart()) {
            args = this.parseExpressionList()
        }
        return { type: "ReturnStatement", arguments: args, ...spanFrom(start, this.previous()) }
    }

    private parseTypeAliasStatement(): TypeAliasStatement {
        const start = this.current()
        this.advance()
        const nameTok = this.expectIdentifier()
        const name: Identifier = { type: "Identifier", name: nameTok.value as string, ...spanFrom(nameTok, nameTok) }

        let generics: GenericTypeParameter[] = []
        if (this.checkOperator("<")) {
            generics = this.parseGenericTypeParameterList()
        }
        this.expectOperator("=")
        const definition = this.parseType()
        return { type: "TypeAliasStatement", name, generics, definition, ...spanFrom(start, this.previous()) }
    }

    private parseExportTypeAliasStatement(): ExportTypeAliasStatement {
        const start = this.current()
        this.advance()
        const alias = this.parseTypeAliasStatement()
        return { type: "ExportTypeAliasStatement", alias, ...spanFrom(start, this.previous()) }
    }

    private parseExpressionStatement(): Statement {
        const start = this.current()
        const first = this.parsePrefixExpression()

        if (this.checkOperator("=") || this.checkPunctuator(",")) {
            const targets = [first]
            while (this.matchPunctuator(",")) {
                targets.push(this.parsePrefixExpression())
            }
            this.expectOperator("=")
            const values = this.parseExpressionList()
            return { type: "AssignmentStatement", targets, values, ...spanFrom(start, this.previous()) }
        }

        const t = this.current()
        if (t.type === "Operator" && COMPOUND_ASSIGN_OPS.has((t as any).value)) {
            const op = (this.advance() as any).value
            const value = this.parseExpression()
            return {
                type: "CompoundAssignmentStatement",
                operator: op,
                target: first,
                value,
                ...spanFrom(start, this.previous()),
            }
        }

        if (first.type === "CallExpression" || first.type === "MethodCallExpression") {
            return { type: "CallStatement", expression: first, ...spanFrom(start, this.previous()) }
        }

        this.error("Unexpected expression statement (expected assignment or call)")
    }

    // ============================================================
    // Expressions
    // ============================================================

    private parseExpressionList(): Expression[] {
        const list = [this.parseExpression()]
        while (this.matchPunctuator(",")) {
            list.push(this.parseExpression())
        }
        return list
    }

    private isBinaryOperator(): string | null {
        const t = this.current()
        if (t.type === "Keyword" && ((t as any).value === "and" || (t as any).value === "or")) {
            return (t as any).value
        }
        if (t.type === "Operator" && (t as any).value in BINARY_PRECEDENCE) {
            return (t as any).value
        }
        return null
    }

    private isUnaryOperator(): string | null {
        const t = this.current()
        if (t.type === "Keyword" && (t as any).value === "not") return "not"
        if (t.type === "Operator" && ((t as any).value === "-" || (t as any).value === "#")) return (t as any).value
        return null
    }

    parseExpression(minPrec = 0): Expression {
        let left = this.parseUnaryOrAtom()

        while (true) {
            const op = this.isBinaryOperator()
            if (!op) break
            const prec = BINARY_PRECEDENCE[op]
            if (prec < minPrec) break

            this.advance()
            const rightAssoc = RIGHT_ASSOCIATIVE.has(op)
            const nextMinPrec = rightAssoc ? prec : prec + 1
            const right = this.parseExpression(nextMinPrec)
            left = {
                type: "BinaryExpression",
                operator: op as any,
                left, right,
                ...spanFrom(left, right),
            }
        }

        return left
    }

    private parseUnaryOrAtom(): Expression {
        const op = this.isUnaryOperator()
        if (op) {
            const opTok = this.advance()
            const argument = this.parseExpression(UNARY_PRECEDENCE)
            return {
                type: "UnaryExpression",
                operator: op as any,
                argument,
                ...spanFrom(opTok, argument),
            }
        }
        return this.parseAtomWithAssertion()
    }

    private parseAtomWithAssertion(): Expression {
        let expr = this.parseAtom()
        while (this.checkPunctuator("::")) {
            this.advance()
            const typeAnnotation = this.parseType()
            expr = {
                type: "TypeAssertionExpression",
                expression: expr,
                typeAnnotation,
                ...spanFrom(expr, typeAnnotation),
            }
        }
        return expr
    }

    private parseAtom(): Expression {
        const t = this.current()

        if (t.type === "Literal") {
            this.advance()
            const lit = t as any
            switch (lit.kind) {
                case "nil":
                    return { type: "NilLiteral", ...spanFrom(t, t) } as NilLiteral
                case "boolean":
                    return { type: "BooleanLiteral", value: lit.value, ...spanFrom(t, t) } as BooleanLiteral
                case "number":
                    return { type: "NumberLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) } as NumberLiteral
                case "string":
                    return { type: "StringLiteral", value: lit.value, raw: lit.raw, ...spanFrom(t, t) } as StringLiteral
            }
        }

        if (t.type === "InterpolatedString") {
            this.advance()
            return this.buildInterpolatedString(t as any)
        }

        if (t.type === "Operator" && (t as any).value === "...") {
            this.advance()
            return { type: "VarargExpression", ...spanFrom(t, t) } as VarargExpression
        }

        if (t.type === "Keyword" && (t as any).value === "function") {
            this.advance()
            const func = this.parseFunctionBody()
            return { type: "FunctionExpression", func, ...spanFrom(t, this.previous()) } as FunctionExpression
        }

        if (t.type === "Keyword" && (t as any).value === "if") {
            return this.parseIfElseExpression()
        }

        if (t.type === "Punctuator" && (t as any).value === "{") {
            return this.parseTableExpression()
        }

        if (t.type === "Identifier" || (t.type === "Punctuator" && (t as any).value === "(")) {
            return this.parsePrefixExpression()
        }

        this.error("Unexpected token in expression")
    }

    private buildInterpolatedString(token: {
        parts: { kind: "string"; value: string; raw: string }[] | any
        line: any; column: any
    }): InterpolatedStringExpression {
        const parts: InterpolatedStringPart[] = []
        for (const p of (token as any).parts as any[]) {
            if (p.kind === "string") {
                parts.push({ kind: "string", value: p.value, raw: p.raw })
            } else {
                const expression = parseExpressionFromSource(p.raw)
                parts.push({ kind: "expression", expression })
            }
        }
        return { type: "InterpolatedStringExpression", parts, ...spanFrom(token as any, token as any) }
    }

    private parseIfElseExpression(): IfElseExpression {
        const start = this.current()
        this.expectKeyword("if")
        const clauses: { condition: Expression; body: Expression }[] = []
        const cond = this.parseExpression()
        this.expectKeyword("then")
        const body = this.parseExpression()
        clauses.push({ condition: cond, body })

        while (this.checkKeyword("elseif")) {
            this.advance()
            const c = this.parseExpression()
            this.expectKeyword("then")
            const b = this.parseExpression()
            clauses.push({ condition: c, body: b })
        }

        this.expectKeyword("else")
        const alternate = this.parseExpression()
        return { type: "IfElseExpression", clauses, alternate, ...spanFrom(start, this.previous()) }
    }

    private parsePrefixExpression(): Expression {
        const start = this.current()
        let base: Expression

        if (this.checkType("Identifier")) {
            base = this.parseIdentifier()
        } else if (this.matchPunctuator("(")) {
            const inner = this.parseExpression()
            this.expectPunctuator(")")
            base = { type: "ParenthesizedExpression", expression: inner, ...spanFrom(start, this.previous()) }
        } else {
            this.error("Expected identifier or '('")
        }

        while (true) {
            if (this.matchPunctuator(".")) {
                const prop = this.parseIdentifier()
                base = { type: "MemberExpression", object: base, property: prop, ...spanFrom(base, prop) }
                continue
            }
            if (this.matchPunctuator("[")) {
                const index = this.parseExpression()
                this.expectPunctuator("]")
                base = { type: "IndexExpression", object: base, index, ...spanFrom(base, this.previous()) }
                continue
            }
            if (this.matchPunctuator(":")) {
                const method = this.parseIdentifier()
                const args = this.parseCallArguments()
                base = {
                    type: "MethodCallExpression",
                    object: base, method, arguments: args,
                    ...spanFrom(base, this.previous()),
                }
                continue
            }
            if (this.checkPunctuator("(") || this.checkType("Literal") && (this.current() as any).kind === "string" ||
                this.checkType("InterpolatedString") || this.checkPunctuator("{")) {
                const args = this.parseCallArguments()
                base = {
                    type: "CallExpression",
                    callee: base, arguments: args,
                    ...spanFrom(base, this.previous()),
                }
                continue
            }
            break
        }

        return base
    }

    private parseCallArguments(): Expression[] {
        if (this.matchPunctuator("(")) {
            if (this.checkPunctuator(")")) {
                this.advance()
                return []
            }
            const list = this.parseExpressionList()
            this.expectPunctuator(")")
            return list
        }

        const t = this.current()
        if (t.type === "Literal" && (t as any).kind === "string") {
            this.advance()
            return [{ type: "StringLiteral", value: (t as any).value, raw: (t as any).raw, ...spanFrom(t, t) }]
        }
        if (t.type === "InterpolatedString") {
            this.advance()
            return [this.buildInterpolatedString(t as any)]
        }
        if (t.type === "Punctuator" && (t as any).value === "{") {
            return [this.parseTableExpression()]
        }

        this.error("Expected function call arguments")
    }

    private parseIdentifier(): Identifier {
        const t = this.expectIdentifier()
        return { type: "Identifier", name: t.value as string, ...spanFrom(t, t) }
    }

    private parseTableExpression(): TableExpression {
        const start = this.current()
        this.expectPunctuator("{")
        const fields: TableField[] = []

        while (!this.checkPunctuator("}")) {
            if (this.matchPunctuator("[")) {
                const key = this.parseExpression()
                this.expectPunctuator("]")
                this.expectOperator("=")
                const value = this.parseExpression()
                fields.push({ type: "TableFieldComputed", key, value })
            } else if (this.checkType("Identifier") && this.peekIsAssignAfterIdentifier()) {
                const name = this.parseIdentifier()
                this.expectOperator("=")
                const value = this.parseExpression()
                fields.push({ type: "TableFieldNamed", name, value })
            } else {
                const value = this.parseExpression()
                fields.push({ type: "TableFieldPositional", value })
            }

            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            break
        }

        this.expectPunctuator("}")
        return { type: "TableExpression", fields, ...spanFrom(start, this.previous()) }
    }

    private peekIsAssignAfterIdentifier(): boolean {
        const next = this.peek(1)
        return next.type === "Operator" && (next as any).value === "="
    }

    private parseTypeOrTypePackReference(): TypeNode {
        if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
            const start = this.current()
            const base = this.expectIdentifier().value as string
            this.advance()
            const packRef: TypeReference = { type: "TypeReference", base, typeArguments: [], ...spanFrom(start, start) }
            return {
                type: "TypePackNode",
                types: [],
                hasVarargs: true,
                // Wrap in `VariadicTypeNode`, matching the convention used by
                // `parseFunctionTypeAfterParen`'s identifier-pack-reference
                // branch, so the printer can tell `A...` (name-first, this
                // case) apart from `...T` (dots-first) and append rather
                // than prepend the `...`.
                varargType: { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(start, this.previous()) } as VariadicTypeNode,
                ...spanFrom(start, this.previous()),
            } as TypePackNode
        }
        return this.parseType()
    }

    private parseTypeArgument(): TypeNode | TypePackNode {
        if (this.checkOperator("...")) {
            return this.parseTypePack()
        }
        if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
            return this.parseTypeOrTypePackReference()
        }
        return this.parseType()
    }

    private parseFunctionBody(): FunctionBody {
        const start = this.current()
        let generics: GenericTypeParameter[] = []
        if (this.checkOperator("<")) {
            generics = this.parseGenericTypeParameterList()
        }

        this.expectPunctuator("(")
        const params: FunctionParameter[] = []
        let hasVarargs = false
        let varargTypeAnnotation: TypeNode | undefined

        if (!this.checkPunctuator(")")) {
            while (true) {
                if (this.checkOperator("...")) {
                    this.advance()
                    hasVarargs = true
                    if (this.matchPunctuator(":")) {
                        varargTypeAnnotation = this.parseTypeOrTypePackReference()
                    }
                    break
                }
                const nameTok = this.expectIdentifier()
                let typeAnnotation: TypeNode | undefined
                if (this.matchPunctuator(":")) {
                    typeAnnotation = this.parseType()
                }
                params.push({
                    type: "FunctionParameter",
                    name: nameTok.value as string,
                    typeAnnotation,
                    ...spanFrom(nameTok, this.previous()),
                })
                if (this.matchPunctuator(",")) continue
                break
            }
        }
        this.expectPunctuator(")")

        let returnType: TypeNode | undefined
        if (this.matchPunctuator(":")) {
            returnType = this.parseTypeOrTypePackReference()
        }

        const body = this.parseBlock()
        this.expectKeyword("end")

        return {
            type: "FunctionBody",
            generics, params, hasVarargs, varargTypeAnnotation, returnType, body,
            ...spanFrom(start, this.previous()),
        }
    }

    // ============================================================
    // Types
    // ============================================================

    parseType(): TypeNode {
        return this.parseUnionType()
    }

    private parseUnionType(): TypeNode {
        const start = this.current()
        this.matchPunctuator("|")
        let left = this.parseIntersectionType()
        if (this.checkPunctuator("|")) {
            const types = [left]
            while (this.matchPunctuator("|")) {
                types.push(this.parseIntersectionType())
            }
            return { type: "UnionTypeNode", types, ...spanFrom(start, this.previous()) }
        }
        return left
    }

    private parseIntersectionType(): TypeNode {
        const start = this.current()
        this.matchPunctuator("&")
        let left = this.parseOptionalType()
        if (this.checkPunctuator("&")) {
            const types = [left]
            while (this.matchPunctuator("&")) {
                types.push(this.parseOptionalType())
            }
            return { type: "IntersectionTypeNode", types, ...spanFrom(start, this.previous()) }
        }
        return left
    }

    private parseOptionalType(): TypeNode {
        let t = this.parsePrimaryType()
        while (this.checkPunctuator("?")) {
            this.advance()
            t = { type: "OptionalTypeNode", typeAnnotation: t, ...spanFrom(t, this.previous()) }
        }
        return t
    }

    private parsePrimaryType(): TypeNode {
        const t = this.current()

        if (t.type === "Operator" && (t as any).value === "<") {
            const generics = this.parseGenericTypeParameterList()
            this.expectPunctuator("(")
            return this.parseFunctionTypeAfterParen(t, generics)
        }

        if (t.type === "Punctuator" && (t as any).value === "(") {
            this.advance()
            return this.parseFunctionTypeAfterParen(t, [])
        }

        if (t.type === "Operator" && (t as any).value === "...") {
            this.advance()
            const inner = this.parseType()
            return { type: "VariadicTypeNode", typeAnnotation: inner, ...spanFrom(t, this.previous()) }
        }

        if (t.type === "Punctuator" && (t as any).value === "{") {
            return this.parseTableType()
        }

        if (t.type === "Identifier" && (t as any).value === "typeof" && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === "(") {
            this.advance()
            this.advance()
            const expression = this.parseExpression()
            this.expectPunctuator(")")
            return { type: "TypeofTypeNode", expression, ...spanFrom(t, this.previous()) } as TypeofTypeNode
        }

        if (t.type === "Literal" && (t as any).kind === "string") {
            this.advance()
            return { type: "TypeLiteralString", value: (t as any).value, ...spanFrom(t, t) } as TypeLiteralString
        }

        if (t.type === "Literal" && (t as any).kind === "boolean") {
            this.advance()
            return { type: "TypeLiteralBoolean", value: (t as any).value, ...spanFrom(t, t) } as TypeLiteralBoolean
        }

        if (t.type === "Literal" && (t as any).kind === "nil") {
            this.advance()
            return { type: "TypeReference", base: "nil", typeArguments: [], ...spanFrom(t, t) } as TypeReference
        }

        if (t.type === "Identifier") {
            this.advance()
            let namespace: string | undefined
            let base = (t as any).value as string
            if (this.matchPunctuator(".")) {
                namespace = base
                base = this.expectIdentifier().value as string
            }
            const typeArguments: (TypeNode | TypePackNode)[] = []
            if (this.checkOperator("<")) {
                this.advance()
                if (!this.checkOperator(">")) {
                    typeArguments.push(this.parseTypeArgument())
                    while (this.matchPunctuator(",")) {
                        typeArguments.push(this.parseTypeArgument())
                    }
                }
                this.expectOperator(">")
            }
            return { type: "TypeReference", base, namespace, typeArguments, ...spanFrom(t, this.previous()) } as TypeReference
        }

        this.error("Unexpected token in type annotation")
    }

    private parseFunctionTypeAfterParen(start: Token, generics: GenericTypeParameter[]): TypeNode {
        const params: FunctionTypeParameter[] = []
        let hasVarargs = false
        let varargType: TypeNode | undefined

        if (!this.checkPunctuator(")")) {
            while (true) {
                if (this.checkOperator("...")) {
                    this.advance()
                    hasVarargs = true
                    varargType = this.parseType()
                    break
                }

                if (this.checkType("Identifier") && this.peek(1).type === "Operator" && (this.peek(1) as any).value === "...") {
                    const packStart = this.current()
                    const packRef = this.parseType()
                    this.advance()
                    hasVarargs = true
                    varargType = { type: "VariadicTypeNode", typeAnnotation: packRef, ...spanFrom(packStart, this.previous()) } as VariadicTypeNode
                    break
                }

                let name: string | undefined
                if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") {
                    name = this.expectIdentifier().value as string
                    this.advance()
                }
                const paramStart = this.current()
                const typeAnnotation = this.parseType()
                params.push({
                    type: "FunctionTypeParameter",
                    name, typeAnnotation,
                    ...spanFrom(paramStart, this.previous()),
                })
                if (this.matchPunctuator(",")) continue
                break
            }
        }
        this.expectPunctuator(")")

        if (this.matchPunctuator("->")) {
            const returnType = this.parseTypeOrTypePackReference()
            return {
                type: "FunctionTypeNode",
                generics, params, hasVarargs, varargType, returnType,
                ...spanFrom(start, this.previous()),
            } as FunctionTypeNode
        }

        if (params.length === 1 && !params[0].name && !hasVarargs) {
            return {
                type: "ParenthesizedTypeNode",
                typeAnnotation: params[0].typeAnnotation,
                ...spanFrom(start, this.previous()),
            } as ParenthesizedTypeNode
        }

        if (params.some(p => p.name !== undefined)) {
            this.error("Expected '->' for function type")
        }

        return {
            type: "TypePackNode",
            types: params.map(p => p.typeAnnotation),
            hasVarargs, varargType,
            ...spanFrom(start, this.previous()),
        } as TypePackNode
    }

    private parseTableType(): TableTypeNode {
        const start = this.current()
        this.expectPunctuator("{")
        const properties: TableTypeProperty[] = []

        while (!this.checkPunctuator("}")) {
            if (this.checkPunctuator("[")) {
                this.advance()
                const keyType = this.parseType()
                this.expectPunctuator("]")
                this.expectPunctuator(":")
                const valueType = this.parseType()
                properties.push({ type: "TableTypeIndexer", keyType, valueType })
            } else if (this.checkType("Identifier") && this.peek(1).type === "Punctuator" && (this.peek(1) as any).value === ":") {
                const name = this.expectIdentifier().value as string
                this.advance()
                const valueType = this.parseType()
                properties.push({
                    type: "TableTypeProperty",
                    name, valueType,
                    optional: valueType.type === "OptionalTypeNode",
                })
            } else {
                const valueType = this.parseType()
                const implicitNumber: TypeReference = {
                    type: "TypeReference", base: "number", typeArguments: [],
                    ...spanFrom(valueType, valueType),
                }
                properties.push({ type: "TableTypeIndexer", keyType: implicitNumber, valueType })
            }

            if (this.matchPunctuator(",") || this.matchPunctuator(";")) continue
            break
        }

        this.expectPunctuator("}")
        return { type: "TableTypeNode", properties, ...spanFrom(start, this.previous()) }
    }

    private parseTypePack(): TypePackNode {
        const start = this.current()
        if (this.matchOperator("...")) {
            const varargType = this.parseType()
            return { type: "TypePackNode", types: [], hasVarargs: true, varargType, ...spanFrom(start, this.previous()) }
        }
        this.expectPunctuator("(")
        const types: TypeNode[] = []
        let hasVarargs = false
        let varargType: TypeNode | undefined
        if (!(this.current().type === "Punctuator" && (this.current() as any).value === ")")) {
            while (true) {
                if (this.matchOperator("...")) {
                    hasVarargs = true
                    varargType = this.parseType()
                    break
                }
                types.push(this.parseType())
                if (this.matchPunctuator(",")) continue
                break
            }
        }
        this.expectPunctuator(")")
        return { type: "TypePackNode", types, hasVarargs, varargType, ...spanFrom(start, this.previous()) }
    }

    private parseGenericTypeParameterList(): GenericTypeParameter[] {
        const list: GenericTypeParameter[] = []
        this.expectOperator("<")
        while (true) {
            const nameTok = this.expectIdentifier()
            let isPack = false
            if (this.matchOperator("...")) {
                isPack = true
            }
            let def: TypeNode | TypePackNode | undefined
            if (this.matchOperator("=")) {
                if (isPack) {
                    def = this.parseTypePack()
                } else {
                    def = this.parseType()
                }
            }
            list.push({
                type: "GenericTypeParameter",
                name: nameTok.value as string,
                isPack,
                default: def,
                ...spanFrom(nameTok, this.previous()),
            })
            if (this.matchPunctuator(",")) continue
            break
        }
        this.expectOperator(">")
        return list
    }
}

// ============================================================
// Public API
// ============================================================

export function parse(source: string): Program {
    const tokens = tokenize(source)
    const parser = new Parser(tokens)
    return parser.parseProgram()
}

export function parseTokens(tokens: Token[]): Program {
    const parser = new Parser(tokens)
    return parser.parseProgram()
}

export function parseExpressionFromSource(raw: string): Expression {
    const tokens = tokenize(raw)
    const parser = new Parser(tokens)
    const expr = (parser as any).parseExpression() as Expression
    return expr
}