// ============================================================
// Luau AST Node Definitions
// ============================================================

export interface BaseNode {
    line: { start: number; end: number }
    column: { start: number; end: number }
}

// ============================================================
// Program / Block
// ============================================================

export interface Program extends BaseNode {
    type: "Program"
    body: Block
}

export interface Block extends BaseNode {
    type: "Block"
    statements: Statement[]
}

// ============================================================
// Statements
// ============================================================

export type Statement =
    | LocalStatement
    | LocalFunctionStatement
    | FunctionDeclarationStatement
    | AssignmentStatement
    | CompoundAssignmentStatement
    | CallStatement
    | DoStatement
    | WhileStatement
    | RepeatStatement
    | IfStatement
    | NumericForStatement
    | GenericForStatement
    | ReturnStatement
    | BreakStatement
    | ContinueStatement
    | TypeAliasStatement
    | ExportTypeAliasStatement

export interface LocalStatement extends BaseNode {
    type: "LocalStatement"
    names: TypedIdentifier[]
    init: Expression[]
    /** true if declared with `const` instead of `local` (Luau const bindings) */
    isConst?: boolean
}

export interface LocalFunctionStatement extends BaseNode {
    type: "LocalFunctionStatement"
    name: Identifier
    func: FunctionBody
    attributes?: string[]
    /** true if declared with `const function` instead of `local function` */
    isConst?: boolean
}

export interface FunctionDeclarationStatement extends BaseNode {
    type: "FunctionDeclarationStatement"
    target: FunctionName
    isMethod: boolean
    func: FunctionBody
    attributes?: string[]
}

export interface FunctionName extends BaseNode {
    type: "FunctionName"
    base: Identifier
    path: Identifier[]
    method?: Identifier
}

export interface AssignmentStatement extends BaseNode {
    type: "AssignmentStatement"
    targets: Expression[]
    values: Expression[]
}

export interface CompoundAssignmentStatement extends BaseNode {
    type: "CompoundAssignmentStatement"
    operator: "+=" | "-=" | "*=" | "/=" | "//=" | "%=" | "^=" | "..="
    target: Expression
    value: Expression
}

export interface CallStatement extends BaseNode {
    type: "CallStatement"
    expression: CallExpression | MethodCallExpression
}

export interface DoStatement extends BaseNode {
    type: "DoStatement"
    body: Block
}

export interface WhileStatement extends BaseNode {
    type: "WhileStatement"
    condition: Expression
    body: Block
}

export interface RepeatStatement extends BaseNode {
    type: "RepeatStatement"
    body: Block
    condition: Expression
}

export interface IfClause extends BaseNode {
    type: "IfClause"
    condition: Expression
    body: Block
}

export interface IfStatement extends BaseNode {
    type: "IfStatement"
    clauses: IfClause[]
    alternate?: Block
}

export interface NumericForStatement extends BaseNode {
    type: "NumericForStatement"
    variable: TypedIdentifier
    start: Expression
    end: Expression
    step?: Expression
    body: Block
}

export interface GenericForStatement extends BaseNode {
    type: "GenericForStatement"
    variables: TypedIdentifier[]
    iterators: Expression[]
    body: Block
}

export interface ReturnStatement extends BaseNode {
    type: "ReturnStatement"
    arguments: Expression[]
}

export interface BreakStatement extends BaseNode {
    type: "BreakStatement"
}

export interface ContinueStatement extends BaseNode {
    type: "ContinueStatement"
}

export interface TypeAliasStatement extends BaseNode {
    type: "TypeAliasStatement"
    name: Identifier
    generics: GenericTypeParameter[]
    definition: TypeNode
}

export interface ExportTypeAliasStatement extends BaseNode {
    type: "ExportTypeAliasStatement"
    alias: TypeAliasStatement
}

export interface GenericTypeParameter extends BaseNode {
    type: "GenericTypeParameter"
    name: string
    isPack?: boolean
    default?: TypeNode | TypePackNode
}

// ============================================================
// Expressions
// ============================================================

export type Expression =
    | Identifier
    | NilLiteral
    | BooleanLiteral
    | NumberLiteral
    | StringLiteral
    | InterpolatedStringExpression
    | VarargExpression
    | FunctionExpression
    | TableExpression
    | BinaryExpression
    | UnaryExpression
    | MemberExpression
    | IndexExpression
    | CallExpression
    | MethodCallExpression
    | ParenthesizedExpression
    | TypeAssertionExpression
    | IfElseExpression

export interface Identifier extends BaseNode {
    type: "Identifier"
    name: string
}

export interface TypedIdentifier extends BaseNode {
    type: "TypedIdentifier"
    name: string
    typeAnnotation?: TypeNode
    attributes?: string[]
}

export interface NilLiteral extends BaseNode {
    type: "NilLiteral"
}

export interface BooleanLiteral extends BaseNode {
    type: "BooleanLiteral"
    value: boolean
}

export interface NumberLiteral extends BaseNode {
    type: "NumberLiteral"
    value: number
    raw: string
}

export interface StringLiteral extends BaseNode {
    type: "StringLiteral"
    value: string
    raw: string
}

export type InterpolatedStringPart =
    | { kind: "string"; value: string; raw: string }
    | { kind: "expression"; expression: Expression }

export interface InterpolatedStringExpression extends BaseNode {
    type: "InterpolatedStringExpression"
    parts: InterpolatedStringPart[]
}

export interface VarargExpression extends BaseNode {
    type: "VarargExpression"
}

export interface FunctionParameter extends BaseNode {
    type: "FunctionParameter"
    name: string
    typeAnnotation?: TypeNode
}

export interface FunctionBody extends BaseNode {
    type: "FunctionBody"
    generics: GenericTypeParameter[]
    params: FunctionParameter[]
    hasVarargs: boolean
    varargTypeAnnotation?: TypeNode
    returnType?: TypeNode
    body: Block
}

export interface FunctionExpression extends BaseNode {
    type: "FunctionExpression"
    func: FunctionBody
}

export type TableField =
    | { type: "TableFieldPositional"; value: Expression }
    | { type: "TableFieldNamed"; name: Identifier; value: Expression }
    | { type: "TableFieldComputed"; key: Expression; value: Expression }

export interface TableExpression extends BaseNode {
    type: "TableExpression"
    fields: TableField[]
}

export const BinaryOperators = [
    "+", "-", "*", "/", "//", "%", "^", "..",
    "==", "~=", "<", ">", "<=", ">=",
    "and", "or",
] as const

export interface BinaryExpression extends BaseNode {
    type: "BinaryExpression"
    operator: typeof BinaryOperators[number]
    left: Expression
    right: Expression
}

export const UnaryOperators = ["-", "not", "#"] as const

export interface UnaryExpression extends BaseNode {
    type: "UnaryExpression"
    operator: typeof UnaryOperators[number]
    argument: Expression
}

export interface MemberExpression extends BaseNode {
    type: "MemberExpression"
    object: Expression
    property: Identifier
}

export interface IndexExpression extends BaseNode {
    type: "IndexExpression"
    object: Expression
    index: Expression
}

export interface CallExpression extends BaseNode {
    type: "CallExpression"
    callee: Expression
    arguments: Expression[]
}

export interface MethodCallExpression extends BaseNode {
    type: "MethodCallExpression"
    object: Expression
    method: Identifier
    arguments: Expression[]
}

export interface ParenthesizedExpression extends BaseNode {
    type: "ParenthesizedExpression"
    expression: Expression
}

export interface TypeAssertionExpression extends BaseNode {
    type: "TypeAssertionExpression"
    expression: Expression
    typeAnnotation: TypeNode
}

export interface IfElseExpression extends BaseNode {
    type: "IfElseExpression"
    clauses: { condition: Expression; body: Expression }[]
    alternate: Expression
}

export type TypeNode =
    | TypeReference
    | TypeLiteralString
    | TypeLiteralBoolean
    | TableTypeNode
    | FunctionTypeNode
    | UnionTypeNode
    | IntersectionTypeNode
    | OptionalTypeNode
    | ParenthesizedTypeNode
    | TypeofTypeNode
    | VariadicTypeNode
    | TypePackNode

export interface TypePackNode extends BaseNode {
    type: "TypePackNode"
    types: TypeNode[]
    hasVarargs: boolean
    varargType?: TypeNode
}

export interface TypeReference extends BaseNode {
    type: "TypeReference"
    base: string
    namespace?: string
    typeArguments: (TypeNode | TypePackNode)[]
}

export interface TypeLiteralString extends BaseNode {
    type: "TypeLiteralString"
    value: string
}

export interface TypeLiteralBoolean extends BaseNode {
    type: "TypeLiteralBoolean"
    value: boolean
}

export type TableTypeProperty =
    | { type: "TableTypeIndexer"; keyType: TypeNode; valueType: TypeNode }
    | { type: "TableTypeProperty"; name: string; valueType: TypeNode; optional: boolean }

export interface TableTypeNode extends BaseNode {
    type: "TableTypeNode"
    properties: TableTypeProperty[]
}

export interface FunctionTypeParameter extends BaseNode {
    type: "FunctionTypeParameter"
    name?: string
    typeAnnotation: TypeNode
}

export interface FunctionTypeNode extends BaseNode {
    type: "FunctionTypeNode"
    generics: GenericTypeParameter[]
    params: FunctionTypeParameter[]
    hasVarargs: boolean
    varargType?: TypeNode
    returnType: TypeNode
}

export interface UnionTypeNode extends BaseNode {
    type: "UnionTypeNode"
    types: TypeNode[]
}

export interface IntersectionTypeNode extends BaseNode {
    type: "IntersectionTypeNode"
    types: TypeNode[]
}

export interface OptionalTypeNode extends BaseNode {
    type: "OptionalTypeNode"
    typeAnnotation: TypeNode
}

export interface ParenthesizedTypeNode extends BaseNode {
    type: "ParenthesizedTypeNode"
    typeAnnotation: TypeNode
}

export interface TypeofTypeNode extends BaseNode {
    type: "TypeofTypeNode"
    expression: Expression
}

export interface VariadicTypeNode extends BaseNode {
    type: "VariadicTypeNode"
    typeAnnotation: TypeNode
}

export type Node =
    | Program
    | Block
    | Statement
    | Expression
    | TypeNode
    | FunctionBody
    | FunctionParameter
    | FunctionName
    | IfClause
    | TypedIdentifier
    | GenericTypeParameter
    | TableField
    | FunctionTypeParameter
    | TableTypeProperty