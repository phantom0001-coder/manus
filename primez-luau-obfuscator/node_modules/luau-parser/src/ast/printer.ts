import type {
    Node, Program, Block, Statement, Expression, TypeNode, TypePackNode,
    LocalStatement, LocalFunctionStatement, FunctionDeclarationStatement,
    FunctionName, AssignmentStatement, CompoundAssignmentStatement,
    CallStatement, DoStatement, WhileStatement, RepeatStatement,
    IfStatement, IfClause, NumericForStatement, GenericForStatement,
    ReturnStatement, BreakStatement, ContinueStatement,
    TypeAliasStatement, ExportTypeAliasStatement, GenericTypeParameter,
    Identifier, TypedIdentifier, NilLiteral, BooleanLiteral, NumberLiteral,
    StringLiteral, InterpolatedStringExpression, VarargExpression,
    FunctionParameter, FunctionBody, FunctionExpression, TableExpression,
    TableField, BinaryExpression, UnaryExpression, MemberExpression,
    IndexExpression, CallExpression, MethodCallExpression,
    ParenthesizedExpression, TypeAssertionExpression, IfElseExpression,
    TypeReference, TypeLiteralString, TypeLiteralBoolean, TableTypeNode,
    TableTypeProperty, FunctionTypeNode, FunctionTypeParameter,
    UnionTypeNode, IntersectionTypeNode, OptionalTypeNode,
    ParenthesizedTypeNode, TypeofTypeNode, VariadicTypeNode,
} from "./nodes"

// ============================================================
// Public API
// ============================================================

export interface PrintOptions {
    /** Quote character used when (re)generating string literals. Default: '"'. */
    quote?: '"' | "'"
}

const DEFAULT_OPTIONS: Required<PrintOptions> = {
    quote: '"',
}

/**
 * Renders an AST node back into Luau source code.
 *
 * Accepts a `Program`, a `Block`, any `Statement`, or any `Expression` /
 * `TypeNode`, so it can be used both to print a whole file and to print
 * a single fragment produced by a transform.
 */
export function print(node: Node, options?: PrintOptions): string {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const printer = new Printer(opts)
    return printer.printNode(node)
}

// ============================================================
// Operator precedence (higher binds tighter), mirrors the Lua manual.
// ============================================================

const BINARY_PRECEDENCE: Record<string, number> = {
    or: 1,
    and: 2,
    "<": 3, ">": 3, "<=": 3, ">=": 3, "~=": 3, "==": 3,
    "..": 4,
    "+": 5, "-": 5,
    "*": 6, "/": 6, "//": 6, "%": 6,
    "^": 8,
}

const UNARY_PRECEDENCE = 7

/** Right-associative binary operators (`..` and `^`). */
function isRightAssociative(op: string): boolean {
    return op === ".." || op === "^"
}

// ============================================================
// Printer
// ============================================================

class Printer {
    private quote: '"' | "'"

    constructor(opts: Required<PrintOptions>) {
        this.quote = opts.quote
    }

    printNode(node: Node): string {
        switch (node.type) {
            case "Program":
                return this.printBlock((node as Program).body)
            case "Block":
                return this.printBlock(node as Block)
            default:
                if (isStatementType(node.type)) {
                    return this.printStatement(node as Statement)
                }
                if (isTypeNodeType(node.type)) {
                    return this.printType(node as TypeNode)
                }
                return this.printExpression(node as Expression)
        }
    }

    // --------------------------------------------------------
    // Block / Statements
    // --------------------------------------------------------

    /**
     * Prints the statements of a block, one per line, each terminated with
     * `;`. No indentation is applied — this printer favors bundler-style
     * compact output over pretty-printing.
     */
    private printBlock(block: Block): string {
        return block.statements.map(s => this.printStatement(s) + ";").join("\n")
    }

    private printStatement(stmt: Statement): string {
        switch (stmt.type) {
            case "LocalStatement": return this.printLocalStatement(stmt)
            case "LocalFunctionStatement": return this.printLocalFunctionStatement(stmt)
            case "FunctionDeclarationStatement": return this.printFunctionDeclarationStatement(stmt)
            case "AssignmentStatement": return this.printAssignmentStatement(stmt)
            case "CompoundAssignmentStatement": return this.printCompoundAssignmentStatement(stmt)
            case "CallStatement": return this.printExpression(stmt.expression)
            case "DoStatement": return this.printDoStatement(stmt)
            case "WhileStatement": return this.printWhileStatement(stmt)
            case "RepeatStatement": return this.printRepeatStatement(stmt)
            case "IfStatement": return this.printIfStatement(stmt)
            case "NumericForStatement": return this.printNumericForStatement(stmt)
            case "GenericForStatement": return this.printGenericForStatement(stmt)
            case "ReturnStatement": return this.printReturnStatement(stmt)
            case "BreakStatement": return "break"
            case "ContinueStatement": return "continue"
            case "TypeAliasStatement": return this.printTypeAliasStatement(stmt)
            case "ExportTypeAliasStatement": return "export " + this.printTypeAliasStatement(stmt.alias)
        }
    }

    private printAttributes(attributes?: string[]): string {
        if (!attributes || attributes.length === 0) return ""
        return attributes.map(a => `@${a}\n`).join("")
    }

    private printLocalStatement(stmt: LocalStatement): string {
        const kw = stmt.isConst ? "const" : "local"
        const names = stmt.names.map(n => this.printTypedIdentifier(n)).join(", ")
        if (stmt.init.length === 0) {
            return `${kw} ${names}`
        }
        const init = stmt.init.map(e => this.printExpression(e)).join(", ")
        return `${kw} ${names} = ${init}`
    }

    private printLocalFunctionStatement(stmt: LocalFunctionStatement): string {
        const kw = stmt.isConst ? "const function" : "local function"
        return `${this.printAttributes(stmt.attributes)}${kw} ${stmt.name.name}${this.printFunctionBody(stmt.func)}`
    }

    private printFunctionDeclarationStatement(stmt: FunctionDeclarationStatement): string {
        // The parser injects a synthetic leading `self` parameter for method
        // declarations (`function T:m(...)`), since `:` already implies it.
        // Printing it back would duplicate `self` when the output is re-parsed.
        const func = stmt.isMethod && stmt.func.params[0]?.name === "self"
            ? { ...stmt.func, params: stmt.func.params.slice(1) }
            : stmt.func
        return `${this.printAttributes(stmt.attributes)}function ${this.printFunctionName(stmt.target)}${this.printFunctionBody(func)}`
    }

    private printFunctionName(name: FunctionName): string {
        let out = name.base.name
        for (const p of name.path) out += "." + p.name
        if (name.method) out += ":" + name.method.name
        return out
    }

    private printAssignmentStatement(stmt: AssignmentStatement): string {
        const targets = stmt.targets.map(t => this.printExpression(t)).join(", ")
        const values = stmt.values.map(v => this.printExpression(v)).join(", ")
        return `${targets} = ${values}`
    }

    private printCompoundAssignmentStatement(stmt: CompoundAssignmentStatement): string {
        return `${this.printExpression(stmt.target)} ${stmt.operator} ${this.printExpression(stmt.value)}`
    }

    private printDoStatement(stmt: DoStatement): string {
        return `do\n${this.printBlock(stmt.body)}\nend`
    }

    private printWhileStatement(stmt: WhileStatement): string {
        return `while ${this.printExpression(stmt.condition)} do\n${this.printBlock(stmt.body)}\nend`
    }

    private printRepeatStatement(stmt: RepeatStatement): string {
        return `repeat\n${this.printBlock(stmt.body)}\nuntil ${this.printExpression(stmt.condition)}`
    }

    private printIfStatement(stmt: IfStatement): string {
        let out = ""
        stmt.clauses.forEach((clause: IfClause, i: number) => {
            const kw = i === 0 ? "if" : "elseif"
            out += `${kw} ${this.printExpression(clause.condition)} then\n${this.printBlock(clause.body)}\n`
        })
        if (stmt.alternate) {
            out += `else\n${this.printBlock(stmt.alternate)}\n`
        }
        out += "end"
        return out
    }

    private printNumericForStatement(stmt: NumericForStatement): string {
        const step = stmt.step ? `, ${this.printExpression(stmt.step)}` : ""
        return `for ${this.printTypedIdentifier(stmt.variable)} = ${this.printExpression(stmt.start)}, ${this.printExpression(stmt.end)}${step} do\n${this.printBlock(stmt.body)}\nend`
    }

    private printGenericForStatement(stmt: GenericForStatement): string {
        const names = stmt.variables.map(v => this.printTypedIdentifier(v)).join(", ")
        const iterators = stmt.iterators.map(e => this.printExpression(e)).join(", ")
        return `for ${names} in ${iterators} do\n${this.printBlock(stmt.body)}\nend`
    }

    private printReturnStatement(stmt: ReturnStatement): string {
        if (stmt.arguments.length === 0) return "return"
        return `return ${stmt.arguments.map(e => this.printExpression(e)).join(", ")}`
    }

    private printTypeAliasStatement(stmt: TypeAliasStatement): string {
        const generics = this.printGenericTypeParameterList(stmt.generics)
        return `type ${stmt.name.name}${generics} = ${this.printType(stmt.definition)}`
    }

    private printGenericTypeParameterList(generics: GenericTypeParameter[]): string {
        if (!generics || generics.length === 0) return ""
        return `<${generics.map(g => this.printGenericTypeParameter(g)).join(", ")}>`
    }

    private printGenericTypeParameter(g: GenericTypeParameter): string {
        let out = g.name + (g.isPack ? "..." : "")
        if (g.default) {
            out += " = " + (isTypePackNode(g.default) ? this.printTypePack(g.default) : this.printType(g.default))
        }
        return out
    }

    // --------------------------------------------------------
    // Shared helpers
    // --------------------------------------------------------

    private printTypedIdentifier(id: TypedIdentifier): string {
        const attrs = id.attributes && id.attributes.length > 0
            ? id.attributes.map(a => `<${a}>`).join(" ") + " "
            : ""
        const type = id.typeAnnotation ? `: ${this.printType(id.typeAnnotation)}` : ""
        return `${attrs}${id.name}${type}`
    }

    private printFunctionParameter(p: FunctionParameter): string {
        const type = p.typeAnnotation ? `: ${this.printType(p.typeAnnotation)}` : ""
        return `${p.name}${type}`
    }

    private printFunctionBody(func: FunctionBody): string {
        const generics = this.printGenericTypeParameterList(func.generics)
        const params: string[] = func.params.map(p => this.printFunctionParameter(p))
        if (func.hasVarargs) {
            const type = func.varargTypeAnnotation ? `: ${this.printType(func.varargTypeAnnotation)}` : ""
            params.push(`...${type}`)
        }
        const returnType = func.returnType ? `: ${this.printType(func.returnType)}` : ""
        return `${generics}(${params.join(", ")})${returnType}\n${this.printBlock(func.body)}\nend`
    }

    // --------------------------------------------------------
    // Expressions
    // --------------------------------------------------------

    private printExpression(expr: Expression): string {
        switch (expr.type) {
            case "Identifier": return expr.name
            case "NilLiteral": return "nil"
            case "BooleanLiteral": return expr.value ? "true" : "false"
            case "NumberLiteral": return this.printNumberLiteral(expr)
            case "StringLiteral": return this.printStringLiteral(expr)
            case "InterpolatedStringExpression": return this.printInterpolatedString(expr)
            case "VarargExpression": return "..."
            case "FunctionExpression": return `function${this.printFunctionBody(expr.func)}`
            case "TableExpression": return this.printTableExpression(expr)
            case "BinaryExpression": return this.printBinaryExpression(expr)
            case "UnaryExpression": return this.printUnaryExpression(expr)
            case "MemberExpression": return `${this.printOperand(expr.object, expr)}.${expr.property.name}`
            case "IndexExpression": return `${this.printOperand(expr.object, expr)}[${this.printExpression(expr.index)}]`
            case "CallExpression": return this.printCallExpression(expr)
            case "MethodCallExpression": return this.printMethodCallExpression(expr)
            case "ParenthesizedExpression": return `(${this.printExpression(expr.expression)})`
            case "TypeAssertionExpression": return `${this.printOperand(expr.expression, expr)} :: ${this.printType(expr.typeAnnotation)}`
            case "IfElseExpression": return this.printIfElseExpression(expr)
        }
    }

    private printNumberLiteral(lit: NumberLiteral): string {
        return lit.raw !== undefined && lit.raw !== "" ? lit.raw : String(lit.value)
    }

    private printStringLiteral(lit: StringLiteral): string {
        return this.quoteString(lit.value)
    }

    private quoteString(value: string): string {
        const q = this.quote
        let out = q
        for (const ch of value) {
            switch (ch) {
                case "\\": out += "\\\\"; break
                case "\n": out += "\\n"; break
                case "\r": out += "\\r"; break
                case "\t": out += "\\t"; break
                case "\0": out += "\\0"; break
                case q: out += "\\" + q; break
                default: out += ch
            }
        }
        return out + q
    }

    private printInterpolatedString(expr: InterpolatedStringExpression): string {
        let out = "`"
        for (const part of expr.parts) {
            if (part.kind === "string") {
                out += this.escapeInterpolatedText(part.value)
            } else {
                out += "{" + this.printExpression(part.expression) + "}"
            }
        }
        return out + "`"
    }

    private escapeInterpolatedText(value: string): string {
        let out = ""
        for (const ch of value) {
            switch (ch) {
                case "\\": out += "\\\\"; break
                case "`": out += "\\`"; break
                case "{": out += "\\{"; break
                case "\n": out += "\\n"; break
                case "\r": out += "\\r"; break
                default: out += ch
            }
        }
        return out
    }

    private printTableExpression(expr: TableExpression): string {
        if (expr.fields.length === 0) return "{}"
        const inner = expr.fields.map(f => this.printTableField(f)).join(",\n")
        return `{\n${inner}\n}`
    }

    private printTableField(field: TableField): string {
        switch (field.type) {
            case "TableFieldPositional": return this.printExpression(field.value)
            case "TableFieldNamed": return `${field.name.name} = ${this.printExpression(field.value)}`
            case "TableFieldComputed": return `[${this.printExpression(field.key)}] = ${this.printExpression(field.value)}`
        }
    }

    private printBinaryExpression(expr: BinaryExpression): string {
        const left = this.printChildForBinary(expr.left, expr, "left")
        const right = this.printChildForBinary(expr.right, expr, "right")
        return `${left} ${expr.operator} ${right}`
    }

    private printChildForBinary(child: Expression, parent: BinaryExpression, side: "left" | "right"): string {
        const printed = this.printExpression(child)
        if (child.type !== "BinaryExpression") {
            return this.wrapIfNeeded(child, printed, parent)
        }
        const parentPrec = BINARY_PRECEDENCE[parent.operator]
        const childPrec = BINARY_PRECEDENCE[child.operator]
        let needsParens = false
        if (childPrec < parentPrec) {
            needsParens = true
        } else if (childPrec === parentPrec) {
            // Same precedence: parenthesize the side that would otherwise
            // re-associate differently than the original tree.
            if (isRightAssociative(parent.operator)) {
                needsParens = side === "left"
            } else {
                needsParens = side === "right"
            }
        }
        return needsParens ? `(${printed})` : printed
    }

    private printUnaryExpression(expr: UnaryExpression): string {
        const argPrinted = this.printExpression(expr.argument)
        let needsParens = false
        if (expr.argument.type === "BinaryExpression") {
            needsParens = BINARY_PRECEDENCE[expr.argument.operator] < UNARY_PRECEDENCE
        } else if (expr.argument.type === "UnaryExpression") {
            needsParens = false
        } else {
            needsParens = !isSimpleOperand(expr.argument)
        }
        const arg = needsParens ? `(${argPrinted})` : argPrinted
        // A bare space is required whenever gluing the operator directly onto
        // the argument would change tokenization: `--x` reads as a comment
        // (operator `-` followed by `-x`), and `##x`/`- -1` style clashes are
        // avoided the same way. `not` always needs a separating space since
        // it's a word, not a symbol.
        const needsSpace = expr.operator === "not" || arg.startsWith(expr.operator)
        return `${expr.operator}${needsSpace ? " " : ""}${arg}`
    }

    /** Generic operand wrapper for non-binary children used inside a binary expression. */
    private wrapIfNeeded(child: Expression, printed: string, _parent: BinaryExpression): string {
        if (child.type === "UnaryExpression" || isSimpleOperand(child)) return printed
        // Function/table/if-else expressions read fine without parens in Lua's grammar
        // when used as binary operands, so only wrap the exotic cases.
        return printed
    }

    /** True for expression kinds that never need parens as a generic sub-expression. */
    private isAtom(expr: Expression): boolean {
        return isSimpleOperand(expr)
    }

    /** Wraps `object`/`callee` in parens when required by call/member/index syntax. */
    private printOperand(object: Expression, _parent: Expression): string {
        const printed = this.printExpression(object)
        if (isCallBaseSafe(object)) return printed
        return `(${printed})`
    }

    private printCallExpression(expr: CallExpression): string {
        const callee = this.printOperand(expr.callee, expr)
        const args = expr.arguments.map(a => this.printExpression(a)).join(", ")
        return `${callee}(${args})`
    }

    private printMethodCallExpression(expr: MethodCallExpression): string {
        const object = this.printOperand(expr.object, expr)
        const args = expr.arguments.map(a => this.printExpression(a)).join(", ")
        return `${object}:${expr.method.name}(${args})`
    }

    private printIfElseExpression(expr: IfElseExpression): string {
        let out = ""
        expr.clauses.forEach((clause, i) => {
            const kw = i === 0 ? "if" : "elseif"
            out += `${i === 0 ? "" : " "}${kw} ${this.printExpression(clause.condition)} then ${this.printExpression(clause.body)}`
        })
        out += ` else ${this.printExpression(expr.alternate)}`
        return out
    }

    // --------------------------------------------------------
    // Types
    // --------------------------------------------------------

    private printType(t: TypeNode): string {
        switch (t.type) {
            case "TypeReference": return this.printTypeReference(t)
            case "TypeLiteralString": return this.quoteString(t.value)
            case "TypeLiteralBoolean": return t.value ? "true" : "false"
            case "TableTypeNode": return this.printTableType(t)
            case "FunctionTypeNode": return this.printFunctionType(t)
            case "UnionTypeNode": return this.printUnionType(t)
            case "IntersectionTypeNode": return this.printIntersectionType(t)
            case "OptionalTypeNode": return `${this.printTypeOperand(t.typeAnnotation)}?`
            case "ParenthesizedTypeNode": return `(${this.printType(t.typeAnnotation)})`
            case "TypeofTypeNode": return `typeof(${this.printExpression(t.expression)})`
            case "VariadicTypeNode": return `...${this.printType(t.typeAnnotation)}`
            case "TypePackNode": return this.printTypePack(t)
        }
    }

    private printTypeOperand(t: TypeNode): string {
        // Union/intersection/function types need grouping when nested inside
        // an optional (`?`) or another composite type.
        if (t.type === "UnionTypeNode" || t.type === "IntersectionTypeNode" || t.type === "FunctionTypeNode") {
            return `(${this.printType(t)})`
        }
        return this.printType(t)
    }

    private printTypeReference(t: TypeReference): string {
        const ns = t.namespace ? `${t.namespace}.` : ""
        const args = t.typeArguments.length > 0
            ? `<${t.typeArguments.map(a => this.printType(a)).join(", ")}>`
            : ""
        return `${ns}${t.base}${args}`
    }

    private printTableType(t: TableTypeNode): string {
        if (t.properties.length === 0) return "{}"
        const inner = t.properties.map(p => this.printTableTypeProperty(p)).join(", ")
        return `{ ${inner} }`
    }

    private printTableTypeProperty(p: TableTypeProperty): string {
        if (p.type === "TableTypeIndexer") {
            return `[${this.printType(p.keyType)}]: ${this.printType(p.valueType)}`
        }
        // `optional` mirrors `valueType.type === "OptionalTypeNode"` (see the
        // parser), so the `?` is already present in the printed value type.
        // Luau has no `name?:` syntax — the `?` only ever goes after the type.
        return `${p.name}: ${this.printType(p.valueType)}`
    }

    /**
     * Prints a vararg type suffix for function-type / type-pack parameter
     * lists. Two distinct grammar productions share this position:
     *   - `...T`  — a vararg of type T (the dots come first in the source).
     *     Represented as a bare `TypeNode` (no wrapper).
     *   - `A...`  — a reference to a generic type pack `A` (the name comes
     *     first). Represented as a `VariadicTypeNode` wrapping the
     *     reference, so the printer must append `...` rather than prepend
     *     it — prepending would reorder `A...` into the invalid `...A`.
     */
    private printVarargTypeSuffix(varargType: TypeNode | undefined): string {
        if (!varargType) return "..."
        if (varargType.type === "VariadicTypeNode") return `${this.printType(varargType.typeAnnotation)}...`
        return `...${this.printType(varargType)}`
    }

    private printFunctionType(t: FunctionTypeNode): string {
        const generics = this.printGenericTypeParameterList(t.generics)
        const params: string[] = t.params.map(p => this.printFunctionTypeParameter(p))
        if (t.hasVarargs) {
            params.push(this.printVarargTypeSuffix(t.varargType))
        }
        return `${generics}(${params.join(", ")}) -> ${this.printType(t.returnType)}`
    }

    private printFunctionTypeParameter(p: FunctionTypeParameter): string {
        const name = p.name ? `${p.name}: ` : ""
        return `${name}${this.printType(p.typeAnnotation)}`
    }

    private printUnionType(t: UnionTypeNode): string {
        return t.types.map(m => this.printUnionMember(m)).join(" | ")
    }

    private printIntersectionType(t: IntersectionTypeNode): string {
        return t.types.map(m => this.printIntersectionMember(m)).join(" & ")
    }

    private printUnionMember(t: TypeNode): string {
        if (t.type === "IntersectionTypeNode" || t.type === "FunctionTypeNode") return `(${this.printType(t)})`
        return this.printType(t)
    }

    private printIntersectionMember(t: TypeNode): string {
        if (t.type === "UnionTypeNode" || t.type === "FunctionTypeNode") return `(${this.printType(t)})`
        return this.printType(t)
    }

    private printTypePack(t: TypePackNode): string {
        const parts: string[] = t.types.map(ty => this.printType(ty))
        if (t.hasVarargs) parts.push(this.printVarargTypeSuffix(t.varargType))
        // A pack made up of nothing but a single vararg/pack-reference
        // (e.g. `A...` or `...T`) doesn't need wrapping parens — and in a
        // return-type / vararg-annotation position, wrapping it can even
        // create a parser ambiguity, since `(A...)` can be misread as the
        // start of a function type (`(params) -> ReturnType`) rather than a
        // parenthesized pack, producing `Expected '->' after '()'`. Only
        // multi-element packs need the parens to disambiguate.
        if (t.types.length === 0 && t.hasVarargs) return parts[0]
        return `(${parts.join(", ")})`
    }
}

// ============================================================
// Small classification helpers
// ============================================================

/** Expression kinds that are always safe as a call/member/index base without parens. */
function isCallBaseSafe(expr: Expression): boolean {
    switch (expr.type) {
        case "Identifier":
        case "MemberExpression":
        case "IndexExpression":
        case "CallExpression":
        case "MethodCallExpression":
        case "ParenthesizedExpression":
            return true
        default:
            return false
    }
}

/** Expression kinds that never require parens as a plain sub-expression (atoms/postfix chains). */
function isSimpleOperand(expr: Expression): boolean {
    switch (expr.type) {
        case "Identifier":
        case "NilLiteral":
        case "BooleanLiteral":
        case "NumberLiteral":
        case "StringLiteral":
        case "InterpolatedStringExpression":
        case "VarargExpression":
        case "FunctionExpression":
        case "TableExpression":
        case "MemberExpression":
        case "IndexExpression":
        case "CallExpression":
        case "MethodCallExpression":
        case "ParenthesizedExpression":
        case "TypeAssertionExpression":
        case "IfElseExpression":
            return true
        default:
            return false
    }
}

function isTypePackNode(t: TypeNode | TypePackNode): t is TypePackNode {
    return t.type === "TypePackNode"
}

const STATEMENT_TYPES = new Set([
    "LocalStatement", "LocalFunctionStatement", "FunctionDeclarationStatement",
    "AssignmentStatement", "CompoundAssignmentStatement", "CallStatement",
    "DoStatement", "WhileStatement", "RepeatStatement", "IfStatement",
    "NumericForStatement", "GenericForStatement", "ReturnStatement",
    "BreakStatement", "ContinueStatement", "TypeAliasStatement",
    "ExportTypeAliasStatement",
])

function isStatementType(type: string): boolean {
    return STATEMENT_TYPES.has(type)
}

const TYPE_NODE_TYPES = new Set([
    "TypeReference", "TypeLiteralString", "TypeLiteralBoolean", "TableTypeNode",
    "FunctionTypeNode", "UnionTypeNode", "IntersectionTypeNode", "OptionalTypeNode",
    "ParenthesizedTypeNode", "TypeofTypeNode", "VariadicTypeNode", "TypePackNode",
])

function isTypeNodeType(type: string): boolean {
    return TYPE_NODE_TYPES.has(type)
}