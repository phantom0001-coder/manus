import { parseExpressionFromSource, type Expression, type Program } from 'luau-parser';
import { findVmCandidates, type VmCandidate } from './vm-candidates.js';

type Instruction = [number, number, number?, number?, number?];

function opcodeMap(seed: number) {
  const values = [11, 23, 37, 53, 71, 89];
  const rotate = Math.abs(seed) % values.length;
  const rotated = values.slice(rotate).concat(values.slice(0, rotate));
  return { loadArg: rotated[0], loadConst: rotated[1], unaryNeg: rotated[2], binary: rotated[3], ret: rotated[4] };
}

function compileExpression(expression: Expression, params: Map<string, number>, code: Instruction[], next: { value: number }): number {
  const destination = next.value++;
  switch (expression.type) {
    case 'NumberLiteral':
      code.push([2, destination, expression.value]);
      return destination;
    case 'BooleanLiteral':
      code.push([2, destination, expression.value ? 1 : 0]);
      return destination;
    case 'Identifier': {
      const index = params.get(expression.name);
      if (index === undefined) throw new Error(`VM candidate references non-parameter ${expression.name}`);
      code.push([1, destination, index]);
      return destination;
    }
    case 'ParenthesizedExpression':
      return compileExpression(expression.expression, params, code, next);
    case 'UnaryExpression': {
      if (expression.operator !== '-') throw new Error(`Unsupported VM unary operator ${expression.operator}`);
      const source = compileExpression(expression.argument, params, code, next);
      code.push([3, destination, source]);
      return destination;
    }
    case 'BinaryExpression': {
      const left = compileExpression(expression.left, params, code, next);
      const right = compileExpression(expression.right, params, code, next);
      const opIndex = ['+', '-', '*', '/', '//', '%', '^'].indexOf(expression.operator);
      if (opIndex < 0) throw new Error(`Unsupported VM binary operator ${expression.operator}`);
      code.push([4 + opIndex, destination, left, right]);
      return destination;
    }
    default:
      throw new Error(`Unsupported VM expression ${expression.type}`);
  }
}

function encode(code: Instruction[], map: ReturnType<typeof opcodeMap>, resultRegister: number): number[][] {
  return code.map(([op, a, b, c, kind]) => {
    if (op === 1) return [map.loadArg, a, b ?? 0];
    if (op === 2) return [map.loadConst, a, b ?? 0];
    if (op === 3) return [map.unaryNeg, a, b ?? 0];
    if (op >= 4 && op <= 10) return [map.binary, a, b ?? 0, c ?? 0, kind ?? op - 3];
    if (op === 99) return [map.ret, resultRegister];
    throw new Error(`Unknown VM opcode ${op}`);
  });
}

function lowerCandidate(candidate: VmCandidate, seed: number): string {
  const params = new Map(candidate.parameterNames.map((name, index) => [name, index + 1]));
  const code: Instruction[] = [];
  const next = { value: 1 };
  const returnStatement = candidate.functionBody.body.statements[0] as { type: 'ReturnStatement'; arguments: Expression[] };
  const result = compileExpression(returnStatement.arguments[0], params, code, next);
  code.push([99, result]);
  const instructions = encode(code, opcodeMap(seed), result);
  const args = `{${candidate.parameterNames.join(',')}}`;
  const instructionTable = JSON.stringify(instructions).replaceAll('[', '{').replaceAll(']', '}');
  return `__p_vm(${instructionTable},${args})`;
}

export function lowerVmCandidates(program: Program, seed: number): { lowered: number; prelude: string } {
  const candidates = findVmCandidates(program);
  for (const candidate of candidates) {
    const returnStatement = candidate.functionBody.body.statements[0] as { type: 'ReturnStatement'; arguments: Expression[] };
    returnStatement.arguments[0] = parseExpressionFromSource(lowerCandidate(candidate, seed));
  }
  const map = opcodeMap(seed);
  const prelude = candidates.length ? `local __p_vm = function(code, args)
    local registers = {}
    local pc = 1
    while true do
        local i = code[pc]
        local op = i[1]
        if op == ${map.loadArg} then
            registers[i[2]] = args[i[3]]
        elseif op == ${map.loadConst} then
            registers[i[2]] = i[3]
        elseif op == ${map.unaryNeg} then
            registers[i[2]] = -registers[i[3]]
        elseif op == ${map.binary} then
            local a, b = registers[i[3]], registers[i[4]]
            local kind = i[5]
            if kind == 1 then registers[i[2]] = a + b
            elseif kind == 2 then registers[i[2]] = a - b
            elseif kind == 3 then registers[i[2]] = a * b
            elseif kind == 4 then registers[i[2]] = a / b
            elseif kind == 5 then registers[i[2]] = a // b
            elseif kind == 6 then registers[i[2]] = a % b
            else registers[i[2]] = a ^ b end
        elseif op == ${map.ret} then
            return registers[i[2]]
        end
        pc += 1
    end
end
` : '';
  return { lowered: candidates.length, prelude };
}
