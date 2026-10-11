import { parseExpressionFromSource, type Expression, type Program } from 'luau-parser';
import { findVmCandidates, type VmCandidate } from './vm-candidates.js';

type Instruction = [number, number, number?, number?, number?];
const MODULUS = 251;

function opcodeMap(seed: number) {
  const values = [11, 23, 37, 53, 71, 89, 107, 131, 149, 167];
  const rotate = Math.abs(seed) % values.length;
  const rotated = values.slice(rotate).concat(values.slice(0, rotate));
  const mul = [3, 5, 7, 11, 13, 17, 19][Math.abs(seed) % 7];
  const add = (Math.abs(seed * 31) + 17) % MODULUS;
  return {
    loadArg: rotated[0],
    loadConst: rotated[1],
    unaryNeg: rotated[2],
    binary: rotated[3],
    ret: rotated[4],
    nop: rotated[5],
    fakeA: rotated[6],
    fakeB: rotated[7],
    fakeC: rotated[8],
    mul,
    add,
    mutationMul: 29,
    mutationAdd: (Math.abs(seed * 43) + 7) % MODULUS,
    constOffset: (Math.abs(seed * 17) % 997) + 101,
    helper: `__p_${Math.abs(seed * 97).toString(36)}`,
  };
}

function encodeField(value: number, map: ReturnType<typeof opcodeMap>, position: number): number {
  const mutation = (position * map.mutationMul + map.mutationAdd) % MODULUS;
  return (value * map.mul + map.add + mutation) % MODULUS;
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
  const encoded: number[][] = [];
  const emit = (fields: number[], rawThird = false) => {
    const position = encoded.length;
    encoded.push(fields.map((value, index) => rawThird && index === 2 ? value : encodeField(value, map, position)));
  };
  for (const [op, a, b, c, kind] of code) {
    if (encoded.length % 2 === 0) emit([map.nop, 0]);
    if (op === 1) emit([map.loadArg, a, b ?? 0]);
    else if (op === 2) emit([map.loadConst, a, (b ?? 0) + map.constOffset], true);
    else if (op === 3) emit([map.unaryNeg, a, b ?? 0]);
    else if (op >= 4 && op <= 10) {
      emit([map.binary, a, b ?? 0, c ?? 0, kind ?? op - 3]);
    } else if (op === 99) emit([map.ret, resultRegister]);
    else throw new Error(`Unknown VM opcode ${op}`);
  }
  return encoded;
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
  return `${opcodeMap(seed).helper}(${instructionTable},${args})`;
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit);
    return;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.type === 'string') visit(record);
  for (const [key, child] of Object.entries(record)) {
    if (key !== 'line' && key !== 'column') walk(child, visit);
  }
}

function hideNumericCallArguments(program: Program, candidates: VmCandidate[], seed: number): { count: number; prelude: string } {
  const names = new Set(candidates.map((candidate) => candidate.functionName).filter((name): name is string => Boolean(name)));
  if (!names.size) return { count: 0, prelude: '' };
  const helper = `__n_${Math.abs(seed * 173).toString(36)}`;
  const base = (Math.abs(seed * 19) % 1000) + 1000;
  let count = 0;
  walk(program, (node) => {
    if (node.type !== 'CallExpression') return;
    const callee = node.callee as { type?: string; name?: string };
    if (callee.type !== 'Identifier' || !callee.name || !names.has(callee.name)) return;
    const argumentsList = node.arguments as Array<{ type?: string; value?: number }>;
    for (let index = 0; index < argumentsList.length; index += 1) {
      const argument = argumentsList[index];
      if (argument.type !== 'NumberLiteral' || typeof argument.value !== 'number' || !Number.isInteger(argument.value)) continue;
      const offset = base + count * 37;
      const encoded = argument.value + offset;
      argumentsList[index] = parseExpressionFromSource(`${helper}(${encoded},${offset})`) as typeof argument;
      count += 1;
    }
  });
  const prelude = count ? `local ${helper} = function(value, offset)
    return value - offset
end
` : '';
  return { count, prelude };
}

export function lowerVmCandidates(program: Program, seed: number): { lowered: number; prelude: string } {
  const candidates = findVmCandidates(program);
  for (const candidate of candidates) {
    const returnStatement = candidate.functionBody.body.statements[0] as { type: 'ReturnStatement'; arguments: Expression[] };
    returnStatement.arguments[0] = parseExpressionFromSource(lowerCandidate(candidate, seed));
  }
  const numeric = hideNumericCallArguments(program, candidates, seed);
  const map = opcodeMap(seed);
  const inverse = Array.from({ length: MODULUS }, (_, value) => value).find((value) => (value * map.mul) % MODULUS === 1) ?? 1;
  const vmPrelude = candidates.length ? `local ${map.helper} = function(code, args)
    local function d(v, position)
        local x = v - ${map.add} - ((position * ${map.mutationMul} + ${map.mutationAdd}) % ${MODULUS})
        while x < 0 do x += ${MODULUS} end
        return (x * ${inverse}) % ${MODULUS}
    end
    local registers = {}
    local pc = 1
    while true do
        local i = code[pc]
        local op = d(i[1], pc - 1)
        if op == ${map.nop} then
        elseif op == ${map.fakeA} then
            local shadow = (pc * 3 + 17) % ${MODULUS}
            if shadow == -1 then registers[1] = shadow end
        elseif op == ${map.fakeB} then
            local shadow = nil
            if shadow ~= nil then return shadow end
        elseif op == ${map.fakeC} then
            if false then error("unreachable VM branch") end
        elseif op == ${map.loadArg} then
            registers[d(i[2], pc - 1)] = args[d(i[3], pc - 1)]
        elseif op == ${map.loadConst} then
            registers[d(i[2], pc - 1)] = i[3] - ${map.constOffset}
        elseif op == ${map.unaryNeg} then
            registers[d(i[2], pc - 1)] = -registers[d(i[3], pc - 1)]
        elseif op == ${map.binary} then
            local dst, a, b = d(i[2], pc - 1), registers[d(i[3], pc - 1)], registers[d(i[4], pc - 1)]
            local kind = d(i[5], pc - 1)
            if kind == 1 then registers[dst] = a + b
            elseif kind == 2 then registers[dst] = a - b
            elseif kind == 3 then registers[dst] = a * b
            elseif kind == 4 then registers[dst] = a / b
            elseif kind == 5 then registers[dst] = a // b
            elseif kind == 6 then registers[dst] = a % b
            else registers[dst] = a ^ b end
        elseif op == ${map.ret} then
            return registers[d(i[2], pc - 1)]
        end
        pc += 1
    end
end
` : '';
  return { lowered: candidates.length, prelude: `${numeric.prelude}${vmPrelude}` };
}
