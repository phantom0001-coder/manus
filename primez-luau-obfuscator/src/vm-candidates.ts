import type { Expression, FunctionBody, Node, Program } from 'luau-parser';

export interface VmCandidate {
  functionBody: FunctionBody;
  parameterNames: string[];
  functionName?: string;
  kind: 'expression' | 'branch' | 'loop';
  reason: 'single-return-arithmetic' | 'pure-branch' | 'pure-numeric-loop';
}

function isExpressionSafe(expression: Expression, parameters: Set<string>): boolean {
  switch (expression.type) {
    case 'NumberLiteral':
      return Number.isInteger(expression.value);
    case 'BooleanLiteral':
      return true;
    case 'Identifier':
      return parameters.has(expression.name);
    case 'ParenthesizedExpression':
      return isExpressionSafe(expression.expression, parameters);
    case 'UnaryExpression':
      return expression.operator === '-' && isExpressionSafe(expression.argument, parameters);
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '//', '%', '^', '>', '<', '>=', '<=', '==', '~='].includes(expression.operator)
        && isExpressionSafe(expression.left, parameters)
        && isExpressionSafe(expression.right, parameters);
    default:
      return false;
  }
}

function walk(value: unknown, visit: (node: Node) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string' && 'line' in record) visit(record as unknown as Node);
  for (const [key, child] of Object.entries(record)) {
    if (key !== 'line' && key !== 'column') walk(child, visit);
  }
}

export function findVmCandidates(program: Program): VmCandidate[] {
  const candidates: VmCandidate[] = [];
  walk(program, (node) => {
    if (node.type !== 'FunctionBody' || node.body.statements.length !== 1) return;
    const statement = node.body.statements[0];
    const parameterNames = node.params.map((parameter) => parameter.name);
    const parameters = new Set(parameterNames);
    if (statement.type === 'ReturnStatement' && statement.arguments.length === 1
      && isExpressionSafe(statement.arguments[0], parameters)) {
      candidates.push({ functionBody: node, parameterNames, kind: 'expression', reason: 'single-return-arithmetic' });
      return;
    }
    if (statement.type !== 'IfStatement' || statement.clauses.length !== 1) return;
    const clause = statement.clauses[0];
    const alternate = statement.alternate;
    const trueReturn = clause.body.statements.length === 1 ? clause.body.statements[0] : null;
    const falseReturn = alternate && alternate.statements.length === 1 ? alternate.statements[0] : null;
    if (trueReturn?.type !== 'ReturnStatement' || falseReturn?.type !== 'ReturnStatement') return;
    if (trueReturn.arguments.length !== 1 || falseReturn.arguments.length !== 1) return;
    if (!isExpressionSafe(clause.condition, parameters)
      || !isExpressionSafe(trueReturn.arguments[0], parameters)
      || !isExpressionSafe(falseReturn.arguments[0], parameters)) return;
    if (clause.condition.type !== 'BinaryExpression'
      || !['>', '<', '>=', '<=', '==', '~='].includes(clause.condition.operator)) return;
    candidates.push({ functionBody: node, parameterNames, kind: 'branch', reason: 'pure-branch' });
  });
  walk(program, (node) => {
    if (node.type !== 'FunctionBody' || node.body.statements.length !== 3) return;
    const [init, loop, returned] = node.body.statements;
    if (init.type !== 'LocalStatement' || init.names.length !== 1 || init.init.length !== 1
      || init.init[0].type !== 'NumberLiteral' || init.init[0].value !== 0) return;
    if (loop.type !== 'NumericForStatement' || returned.type !== 'ReturnStatement' || returned.arguments.length !== 1) return;
    const accumulator = init.names[0].name;
    if (returned.arguments[0].type !== 'Identifier' || returned.arguments[0].name !== accumulator) return;
    if (loop.start.type !== 'NumberLiteral' || !Number.isInteger(loop.start.value)) return;
    if (loop.end.type !== 'Identifier' || !parametersFor(node).has(loop.end.name)) return;
    if (loop.body.statements.length !== 1) return;
    const body = loop.body.statements[0];
    if (body.type !== 'CompoundAssignmentStatement' || body.operator !== '+='
      || body.target.type !== 'Identifier' || body.target.name !== accumulator
      || body.value.type !== 'Identifier' || body.value.name !== loop.variable.name) return;
    candidates.push({ functionBody: node, parameterNames: node.params.map((parameter) => parameter.name), kind: 'loop', reason: 'pure-numeric-loop' });
  });
  walk(program, (node) => {
    if (node.type !== 'LocalFunctionStatement') return;
    const candidate = candidates.find((item) => item.functionBody === node.func);
    if (candidate) candidate.functionName = node.name.name;
  });
  return candidates;
}

function parametersFor(node: FunctionBody): Set<string> {
  return new Set(node.params.map((parameter) => parameter.name));
}
