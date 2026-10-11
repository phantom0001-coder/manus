import type { Expression, FunctionBody, Node, Program } from 'luau-parser';

export interface VmCandidate {
  functionBody: FunctionBody;
  parameterNames: string[];
  reason: 'single-return-arithmetic';
}

function isExpressionSafe(expression: Expression, parameters: Set<string>): boolean {
  switch (expression.type) {
    case 'NumberLiteral':
    case 'BooleanLiteral':
      return true;
    case 'Identifier':
      return parameters.has(expression.name);
    case 'ParenthesizedExpression':
      return isExpressionSafe(expression.expression, parameters);
    case 'UnaryExpression':
      return expression.operator === '-' && isExpressionSafe(expression.argument, parameters);
    case 'BinaryExpression':
      return ['+', '-', '*', '/', '//', '%', '^'].includes(expression.operator)
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
    if (statement.type !== 'ReturnStatement' || statement.arguments.length !== 1) return;
    const parameterNames = node.params.map((parameter) => parameter.name);
    if (!isExpressionSafe(statement.arguments[0], new Set(parameterNames))) return;
    candidates.push({ functionBody: node, parameterNames, reason: 'single-return-arithmetic' });
  });
  return candidates;
}
