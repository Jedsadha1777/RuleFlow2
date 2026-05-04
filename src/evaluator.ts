import Decimal from 'decimal.js-light';
import type {
  AstNode,
  Block,
  CellPattern,
  FormulaBlock,
  IfBlock,
  Inputs,
  Module,
  Outputs,
  Payload,
  PreparedBlock,
  PreparedModule,
  PreparedOut,
  PreparedPayload,
  PreparedSetEntry,
  PreparedValue,
  PrimType,
  SwitchBlock,
  TableBlock,
  ValueOrExpr,
} from './types.js';
import { ConfigError, InputError, RunError } from './errors.js';
import { isValidDate, isValidDateTime, isValidTime } from './util.js';
import { collectVarRefs, parseCellPattern, parseExpr } from './parser.js';
import { FunctionRegistry } from './functions.js';

const isDec = (v: unknown): v is Decimal => v instanceof Decimal;
const toNum = (v: unknown): number => (isDec(v) ? v.toNumber() : Number(v));
const toDec = (v: unknown): Decimal => (isDec(v) ? v : new Decimal(v as string | number));

export function coerceInput(value: unknown, type: PrimType, name: string): unknown {
  if (value === null || value === undefined) return null;

  if (type === 'num') {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    throw mismatch(name, 'num', value);
  }
  if (type === 'dec') {
    if (value instanceof Decimal) return value;
    if (typeof value === 'number' || typeof value === 'string') {
      try {
        return new Decimal(value);
      } catch {
        throw mismatch(name, 'dec', value);
      }
    }
    throw mismatch(name, 'dec', value);
  }
  if (type === 'str') {
    if (typeof value === 'string') return value;
    throw mismatch(name, 'str', value);
  }
  if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    throw mismatch(name, 'bool', value);
  }
  if (type === 'date') {
    if (typeof value === 'string' && isValidDate(value)) return value;
    throw mismatch(name, 'date (YYYY-MM-DD)', value);
  }
  if (type === 'time') {
    if (typeof value === 'string' && isValidTime(value)) return value;
    throw mismatch(name, 'time (HH:MM:SS)', value);
  }
  if (type === 'datetime') {
    if (typeof value === 'string' && isValidDateTime(value)) return value;
    throw mismatch(name, 'datetime (ISO-8601)', value);
  }
  return null;
}

function mismatch(name: string, expected: string, got: unknown): InputError {
  return new InputError('R1_TYPE_MISMATCH', name, `expected ${expected}, got ${typeof got}`, { expected, got });
}

export function coerceOutput(value: unknown, type: PrimType): unknown {
  if (value === null || value === undefined) return null;

  if (type === 'num') {
    if (typeof value === 'number') return value;
    if (value instanceof Decimal) return value.toNumber();
    if (typeof value === 'string') {
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return value;
  }
  if (type === 'dec') {
    if (value instanceof Decimal) return value;
    if (typeof value === 'number' || typeof value === 'string') {
      try {
        return new Decimal(value);
      } catch {
        return value;
      }
    }
    return value;
  }
  if (type === 'str') {
    if (typeof value === 'string') return value;
    if (value instanceof Decimal) return value.toString();
    return String(value);
  }
  if (type === 'bool') {
    if (typeof value === 'boolean') return value;
    return Boolean(value);
  }
  if (type === 'date' || type === 'time' || type === 'datetime') {
    return typeof value === 'string' ? value : String(value);
  }
  return null;
}

export function serialize(value: unknown): unknown {
  if (value instanceof Decimal) return value.toString();
  return value;
}

export function evalExpr(node: AstNode, ctx: Record<string, unknown>, reg: FunctionRegistry): unknown {
  if (node.k === 'lit') return node.value;

  if (node.k === 'var') {
    if (!(node.name in ctx)) {
      throw new RunError('R2_UNDEFINED_VAR', `variable '$${node.name}' not in context`);
    }
    return ctx[node.name];
  }

  if (node.k === 'bin') {
    const l = evalExpr(node.left, ctx, reg);
    const r = evalExpr(node.right, ctx, reg);
    return evalBin(node.op, l, r);
  }

  if (node.k === 'un') {
    const v = evalExpr(node.operand, ctx, reg);
    if (node.op === '-') {
      if (isDec(v)) return v.neg();
      return -toNum(v);
    }
    if (typeof v !== 'boolean') throw new RunError('R2_TYPE', `'!' expects bool, got ${typeof v}`);
    return !v;
  }

  if (node.k === 'cmp') {
    const l = evalExpr(node.left, ctx, reg);
    const r = evalExpr(node.right, ctx, reg);
    return evalCmp(node.op, l, r);
  }

  if (node.k === 'logic') {
    if (node.op === 'NOT') {
      const v = evalExpr(node.operands[0], ctx, reg);
      if (typeof v !== 'boolean') throw new RunError('R2_TYPE', `'NOT' expects bool, got ${typeof v}`);
      return !v;
    }
    if (node.op === 'AND') {
      for (const op of node.operands) {
        const v = evalExpr(op, ctx, reg);
        if (typeof v !== 'boolean') throw new RunError('R2_TYPE', `'AND' operand must be bool, got ${typeof v}`);
        if (!v) return false;
      }
      return true;
    }
    for (const op of node.operands) {
      const v = evalExpr(op, ctx, reg);
      if (typeof v !== 'boolean') throw new RunError('R2_TYPE', `'OR' operand must be bool, got ${typeof v}`);
      if (v) return true;
    }
    return false;
  }

  const fn = reg.get(node.name);
  if (!fn) throw new RunError('R2_UNKNOWN_FUNC', `unknown function '${node.name}'`);
  const args = node.args.map((a) => evalExpr(a, ctx, reg));
  try {
    return fn.impl(...args);
  } catch (e) {
    if (e instanceof RunError) throw e;
    const msg = e instanceof Error ? e.message : String(e);
    throw new RunError('R2_FUNC_THREW', `${node.name}: ${msg}`);
  }
}

function evalBin(op: string, l: unknown, r: unknown): unknown {
  if (l === null || r === null) throw new RunError('R2_NULL_OPERAND', `null operand in '${op}'`);
  if (typeof l === 'string' || typeof r === 'string') {
    throw new RunError('R2_TYPE', `cannot use '${op}' on string (use functions like concat)`);
  }
  if (typeof l === 'boolean' || typeof r === 'boolean') {
    throw new RunError('R2_TYPE', `cannot use '${op}' on bool`);
  }

  const useDec = isDec(l) || isDec(r);

  if (op === '/') {
    const rd = toDec(r);
    if (rd.isZero()) throw new RunError('R2_DIVIDE_BY_ZERO', 'division by zero');
    if (useDec) return toDec(l).div(rd);
    return toNum(l) / toNum(r);
  }
  if (op === '%') {
    if (toNum(r) === 0) throw new RunError('R2_DIVIDE_BY_ZERO', 'modulo by zero');
    if (useDec) return toDec(l).mod(toDec(r));
    return toNum(l) % toNum(r);
  }
  if (op === '+') return useDec ? toDec(l).plus(toDec(r)) : toNum(l) + toNum(r);
  if (op === '-') return useDec ? toDec(l).minus(toDec(r)) : toNum(l) - toNum(r);
  if (op === '*') return useDec ? toDec(l).mul(toDec(r)) : toNum(l) * toNum(r);
  if (op === '**') return useDec ? toDec(l).pow(toDec(r)) : Math.pow(toNum(l), toNum(r));
  throw new RunError('R2_OP', `unknown binary op ${op}`);
}

function evalCmp(op: string, l: unknown, r: unknown): boolean {
  if (l === null || r === null) {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    throw new RunError('R2_NULL_OPERAND', `null operand in compare '${op}'`);
  }

  if (typeof l === 'string' && typeof r === 'string') {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    if (op === '>') return l > r;
    if (op === '<') return l < r;
    if (op === '>=') return l >= r;
    if (op === '<=') return l <= r;
  }

  if (typeof l === 'boolean' || typeof r === 'boolean') {
    if (op === '==') return l === r;
    if (op === '!=') return l !== r;
    throw new RunError('R2_TYPE', `cannot use '${op}' on bool`);
  }

  const useDec = isDec(l) || isDec(r);
  if (useDec) {
    const a = toDec(l);
    const b = toDec(r);
    if (op === '==') return a.eq(b);
    if (op === '!=') return !a.eq(b);
    if (op === '>') return a.gt(b);
    if (op === '<') return a.lt(b);
    if (op === '>=') return a.gte(b);
    if (op === '<=') return a.lte(b);
  } else {
    const a = toNum(l);
    const b = toNum(r);
    if (op === '==') return a === b;
    if (op === '!=') return a !== b;
    if (op === '>') return a > b;
    if (op === '<') return a < b;
    if (op === '>=') return a >= b;
    if (op === '<=') return a <= b;
  }
  throw new RunError('R2_OP', `unknown compare op ${op}`);
}

export function prepareValue(raw: ValueOrExpr, type: PrimType): PreparedValue {
  if (raw === null) return { kind: 'literal', value: null };
  if (typeof raw === 'boolean') return { kind: 'literal', value: coerceOutput(raw, type) };
  if (typeof raw === 'number') return { kind: 'literal', value: coerceOutput(raw, type) };

  if (type === 'date' && isValidDate(raw)) return { kind: 'literal', value: raw };
  if (type === 'time' && isValidTime(raw)) return { kind: 'literal', value: raw };
  if (type === 'datetime' && isValidDateTime(raw)) return { kind: 'literal', value: raw };

  let ast: AstNode;
  try {
    ast = parseExpr(raw);
  } catch {
    if (type === 'str' || type === 'date' || type === 'time' || type === 'datetime') {
      return { kind: 'literal', value: raw };
    }
    throw new ConfigError('S5_VALUE_PARSE', `cannot parse value '${raw}' for ${type} output`);
  }

  if (ast.k === 'lit') {
    return { kind: 'literal', value: coerceOutput(ast.value, type) };
  }

  return { kind: 'expr', ast };
}

function preparePayload(payload: Payload, outs: PreparedOut[]): PreparedPayload {
  if (Array.isArray(payload)) {
    return { kind: 'blocks', blocks: payload.map((b) => prepareBlock(b)) };
  }
  const outMap = new Map(outs.map((o) => [o.name, o.type] as const));
  const entries: PreparedSetEntry[] = [];
  for (const [outName, raw] of Object.entries(payload)) {
    const type = outMap.get(outName);
    if (!type) {
      throw new ConfigError(
        'S6_UNKNOWN_OUTPUT',
        `payload sets undeclared output '${outName}'`,
      );
    }
    entries.push({ output: outName, type, value: prepareValue(raw, type) });
  }
  return { kind: 'set', entries };
}

function prepareOuts(outs: [string, PrimType, ValueOrExpr][]): PreparedOut[] {
  return outs.map(([name, type, fb]) => ({ name, type, fallback: coerceOutput(fb, type) }));
}

function prepareBlock(block: Block): PreparedBlock {
  const kind = blockKind(block);
  if (kind === 'formula') {
    const b = block as FormulaBlock;
    return {
      kind: 'formula',
      id: b.id,
      outName: b.out[0],
      outType: b.out[1],
      expr: parseExpr(b.expr),
    };
  }
  if (kind === 'if') {
    const b = block as IfBlock;
    const outs = prepareOuts(b.outs);
    return {
      kind: 'if',
      id: b.id,
      outs,
      branches: b.branches.map(([cond, payload]) => ({
        cond: parseExpr(cond),
        payload: preparePayload(payload, outs),
      })),
      else: preparePayload(b.else, outs),
    };
  }
  if (kind === 'switch') {
    const b = block as SwitchBlock;
    const outs = prepareOuts(b.outs);
    const onName = b.on.startsWith('$') ? b.on.slice(1) : b.on;
    return {
      kind: 'switch',
      id: b.id,
      on: onName,
      outs,
      cases: b.cases.map(([value, payload]) => ({ value, payload: preparePayload(payload, outs) })),
      default: preparePayload(b.default, outs),
    };
  }
  const b = block as TableBlock;
  const outs = prepareOuts(b.outs);
  const tableNames = b.table.map((v) => (v.startsWith('$') ? v.slice(1) : v));
  return {
    kind: 'table',
    id: b.id,
    table: tableNames,
    outs,
    rows: b.rows.map((row) => {
      const cells = row.slice(0, tableNames.length).map((c) => parseCellPattern(c));
      const payload = row[tableNames.length] as Payload;
      return { cells, payload: preparePayload(payload, outs) };
    }),
    default: preparePayload(b.default, outs),
  };
}

export function blockKind(b: Block): 'formula' | 'if' | 'switch' | 'table' {
  const kinds = [
    'expr' in b ? 'formula' : null,
    'branches' in b ? 'if' : null,
    'cases' in b ? 'switch' : null,
    'table' in b ? 'table' : null,
  ].filter((x): x is 'formula' | 'if' | 'switch' | 'table' => x !== null);
  if (kinds.length === 0) {
    throw new ConfigError('S1_BLOCK_KIND_MISSING', `block '${(b as Block).id}' has no expr/branches/cases/table`);
  }
  if (kinds.length > 1) {
    throw new ConfigError('S1_BLOCK_KIND_AMBIGUOUS', `block '${(b as Block).id}' has multiple kinds: ${kinds.join(', ')}`);
  }
  return kinds[0];
}

function collectAllBlockIds(blocks: Block[], out: Set<string> = new Set()): Set<string> {
  for (const b of blocks) {
    if (out.has(b.id)) {
      throw new ConfigError('S2_DUPLICATE_ID', `block id '${b.id}' duplicated`);
    }
    out.add(b.id);
    for (const child of nestedBlocks(b)) collectAllBlockIds([child], out);
  }
  return out;
}

function nestedBlocks(b: Block): Block[] {
  const out: Block[] = [];
  const fromPayload = (p: Payload) => {
    if (Array.isArray(p)) out.push(...p);
  };
  if ('branches' in b) {
    for (const [, p] of b.branches) fromPayload(p);
    fromPayload(b.else);
  }
  if ('cases' in b) {
    for (const [, p] of b.cases) fromPayload(p);
    fromPayload(b.default);
  }
  if ('table' in b) {
    for (const row of b.rows) fromPayload(row[b.table.length] as Payload);
    fromPayload(b.default);
  }
  return out;
}

export function prepareModule(module: Module): PreparedModule {
  collectAllBlockIds(module.blocks);
  const order = topoSort(module);
  const prepared = order.map((b) => prepareBlock(b));
  return { module, order: prepared };
}

function topoSort(module: Module): Block[] {
  const inputs = new Set(module.inputs.map((i) => i.name));
  const ownerByOutput = new Map<string, string>();
  const blockById = new Map<string, Block>();

  for (const b of module.blocks) {
    blockById.set(b.id, b);
    for (const o of outputsOf(b)) ownerByOutput.set(o, b.id);
  }

  const deps = new Map<string, Set<string>>();
  for (const b of module.blocks) {
    const refs = collectBlockVarRefs(b);
    const dep = new Set<string>();
    for (const r of refs) {
      if (inputs.has(r)) continue;
      const owner = ownerByOutput.get(r);
      if (owner && owner !== b.id) dep.add(owner);
    }
    deps.set(b.id, dep);
  }

  const dependents = new Map<string, Set<string>>();
  for (const id of blockById.keys()) dependents.set(id, new Set());
  for (const [id, ds] of deps) {
    for (const d of ds) dependents.get(d)?.add(id);
  }

  const inDegree = new Map<string, number>();
  for (const id of blockById.keys()) inDegree.set(id, deps.get(id)?.size ?? 0);

  const origIdx = new Map(module.blocks.map((b, i) => [b.id, i]));
  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);
  queue.sort((a, b) => (origIdx.get(a) ?? 0) - (origIdx.get(b) ?? 0));

  const order: Block[] = [];
  const sorted = new Set<string>();

  while (queue.length > 0) {
    const id = queue.shift() as string;
    if (sorted.has(id)) continue;
    sorted.add(id);
    order.push(blockById.get(id) as Block);
    const newReady: string[] = [];
    for (const dep of dependents.get(id) ?? []) {
      const d = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, d);
      if (d === 0 && !sorted.has(dep)) newReady.push(dep);
    }
    newReady.sort((a, b) => (origIdx.get(a) ?? 0) - (origIdx.get(b) ?? 0));
    queue.push(...newReady);
  }

  if (order.length !== module.blocks.length) {
    const remaining = module.blocks.filter((b) => !sorted.has(b.id)).map((b) => b.id);
    throw new ConfigError('S4_CYCLE', `cycle detected involving blocks: ${remaining.join(', ')}`);
  }
  return order;
}

function outputsOf(b: Block): string[] {
  if ('out' in b) return [b.out[0]];
  if ('outs' in b) return b.outs.map((o) => o[0]);
  return [];
}

export function collectBlockVarRefs(b: Block): Set<string> {
  const refs = new Set<string>();
  const fromExpr = (s: string) => {
    try {
      for (const r of collectVarRefs(parseExpr(s))) refs.add(r);
    } catch {
      // expression may also be raw str literal in some contexts; skip
    }
  };
  const fromValue = (v: unknown) => {
    if (typeof v === 'string') fromExpr(v);
  };
  const fromPayload = (p: Payload) => {
    if (Array.isArray(p)) {
      for (const sub of p) for (const r of collectBlockVarRefs(sub)) refs.add(r);
      return;
    }
    for (const v of Object.values(p)) fromValue(v);
  };

  if ('expr' in b) fromExpr(b.expr);
  if ('branches' in b) {
    for (const [cond, payload] of b.branches) {
      fromExpr(cond);
      fromPayload(payload);
    }
    fromPayload(b.else);
  }
  if ('cases' in b) {
    refs.add(b.on.startsWith('$') ? b.on.slice(1) : b.on);
    for (const [, payload] of b.cases) fromPayload(payload);
    fromPayload(b.default);
  }
  if ('table' in b) {
    for (const v of b.table) refs.add(v.startsWith('$') ? v.slice(1) : v);
    for (const row of b.rows) fromPayload(row[b.table.length] as Payload);
    fromPayload(b.default);
  }
  return refs;
}

export function checkInputs(module: Module, inputs: Inputs): Record<string, unknown> {
  const ctx: Record<string, unknown> = {};
  for (const decl of module.inputs) {
    const raw = inputs[decl.name];
    if (raw === undefined || raw === null) {
      if (decl.nullable) {
        ctx[decl.name] = null;
        continue;
      }
      throw new InputError('R1_MISSING_REQUIRED', decl.name, `missing required input`);
    }
    const val = coerceInput(raw, decl.type, decl.name);
    if (decl.enum && decl.type === 'str') {
      if (!decl.enum.includes(val as string)) {
        throw new InputError('R1_OUT_OF_ENUM', decl.name, `value '${String(val)}' not in enum`, {
          expected: decl.enum,
          got: val,
        });
      }
    }
    if (decl.type === 'num' && (decl.min !== undefined || decl.max !== undefined)) {
      const n = val as number;
      if (decl.min !== undefined && n < Number(decl.min)) {
        throw new InputError('R1_OUT_OF_RANGE', decl.name, `${n} < min ${decl.min}`);
      }
      if (decl.max !== undefined && n > Number(decl.max)) {
        throw new InputError('R1_OUT_OF_RANGE', decl.name, `${n} > max ${decl.max}`);
      }
    }
    if (decl.type === 'dec' && (decl.min !== undefined || decl.max !== undefined)) {
      const n = (val as Decimal).toNumber();
      if (decl.min !== undefined && n < Number(decl.min)) {
        throw new InputError('R1_OUT_OF_RANGE', decl.name, `${n} < min ${decl.min}`);
      }
      if (decl.max !== undefined && n > Number(decl.max)) {
        throw new InputError('R1_OUT_OF_RANGE', decl.name, `${n} > max ${decl.max}`);
      }
    }
    ctx[decl.name] = val;
  }
  return ctx;
}

function evalPreparedBlock(block: PreparedBlock, vars: Record<string, unknown>, reg: FunctionRegistry): void {
  if (block.kind === 'formula') {
    const v = evalExpr(block.expr, vars, reg);
    vars[block.outName] = coerceOutput(v, block.outType);
    return;
  }

  if (block.kind === 'if') {
    initFallbacks(block.outs, vars);
    for (const branch of block.branches) {
      const result = evalExpr(branch.cond, vars, reg);
      if (typeof result !== 'boolean') {
        throw new RunError('R2_TYPE', `if branch '${block.id}' condition must return bool`);
      }
      if (result) {
        applyPreparedPayload(branch.payload, vars, reg);
        return;
      }
    }
    applyPreparedPayload(block.else, vars, reg);
    return;
  }

  if (block.kind === 'switch') {
    initFallbacks(block.outs, vars);
    const subject = vars[block.on];
    for (const c of block.cases) {
      if (matchesEqual(subject, c.value)) {
        applyPreparedPayload(c.payload, vars, reg);
        return;
      }
    }
    applyPreparedPayload(block.default, vars, reg);
    return;
  }

  initFallbacks(block.outs, vars);
  const colValues = block.table.map((n) => vars[n]);
  for (const row of block.rows) {
    if (rowMatches(row.cells, colValues)) {
      applyPreparedPayload(row.payload, vars, reg);
      return;
    }
  }
  applyPreparedPayload(block.default, vars, reg);
}

function initFallbacks(outs: PreparedOut[], vars: Record<string, unknown>): void {
  for (const o of outs) vars[o.name] = o.fallback;
}

function applyPreparedPayload(p: PreparedPayload, vars: Record<string, unknown>, reg: FunctionRegistry): void {
  if (p.kind === 'blocks') {
    for (const sub of p.blocks) evalPreparedBlock(sub, vars, reg);
    return;
  }
  for (const e of p.entries) {
    if (e.value.kind === 'literal') {
      vars[e.output] = e.value.value;
    } else {
      const v = evalExpr(e.value.ast, vars, reg);
      vars[e.output] = coerceOutput(v, e.type);
    }
  }
}

function matchesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  return serialize(a) === serialize(b);
}

function rowMatches(cells: CellPattern[], colValues: unknown[]): boolean {
  for (let i = 0; i < cells.length; i++) {
    if (!cellMatches(cells[i], colValues[i])) return false;
  }
  return true;
}

function cellMatches(p: CellPattern, value: unknown): boolean {
  if (p.k === 'wildcard') return true;
  if (p.k === 'literal') return matchesEqual(p.value, value);
  if (p.k === 'cmp') {
    const v = numericOf(value);
    if (v === null) return false;
    if (p.op === '>') return v > p.value;
    if (p.op === '<') return v < p.value;
    if (p.op === '>=') return v >= p.value;
    if (p.op === '<=') return v <= p.value;
    return v !== p.value;
  }
  const v = numericOf(value);
  if (v === null) return false;
  return v >= p.lo && v <= p.hi;
}

function numericOf(v: unknown): number | null {
  if (typeof v === 'number') return v;
  if (v instanceof Decimal) return v.toNumber();
  if (typeof v === 'string') {
    const n = Number(v);
    if (Number.isFinite(n) && v.trim().length > 0) return n;
  }
  return null;
}

export function evalModule(prepared: PreparedModule, inputs: Inputs, reg: FunctionRegistry): Outputs {
  const vars = checkInputs(prepared.module, inputs);
  for (const block of prepared.order) {
    try {
      evalPreparedBlock(block, vars, reg);
    } catch (e) {
      if (e instanceof RunError) {
        e.loc = { ...e.loc, block: block.id };
      }
      throw e;
    }
  }
  const out: Outputs = {};
  for (const name of prepared.module.outputs) {
    if (!(name in vars)) {
      throw new RunError('R2_OUTPUT_MISSING', `module output '${name}' not produced`);
    }
    out[name] = serialize(vars[name]);
  }
  return out;
}

export interface DebugTrace {
  order: string[];
  intermediate: Record<string, {
    block_kind: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
    delta: Record<string, unknown>;
  }>;
  timing_us: Record<string, number>;
  total_us: number;
}

export interface DebugResult {
  result: Outputs;
  trace: DebugTrace;
}

function snapshotVars(vars: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(vars)) out[k] = serialize(v);
  return out;
}

function diffVars(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const delta: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    if (!(k in before) || before[k] !== v) delta[k] = v;
  }
  return delta;
}

export interface ExprPreview {
  result?: unknown;
  error?: string;
}

export function previewExpr(expr: string, vars: Record<string, unknown>, reg: FunctionRegistry): ExprPreview {
  try {
    const ast = parseExpr(expr);
    const v = evalExpr(ast, vars, reg);
    return { result: serialize(v) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface BlockScope {
  vars: string[];
  functions: string[];
}

export function scopeAt(module: Module, blockId: string, reg: FunctionRegistry): BlockScope {
  const vars = new Set<string>(module.inputs.map((i) => i.name));
  const order = topoSortPublic(module);
  for (const b of order) {
    if (b.id === blockId) break;
    if ('out' in b) vars.add(b.out[0]);
    if ('outs' in b) for (const o of b.outs) vars.add(o[0]);
  }
  return {
    vars: Array.from(vars),
    functions: reg.list().map((f) => f.name),
  };
}

function topoSortPublic(module: Module): Block[] {
  try {
    return topoSort(module);
  } catch {
    return [...module.blocks];
  }
}

export function debugModule(prepared: PreparedModule, inputs: Inputs, reg: FunctionRegistry): DebugResult {
  const vars = checkInputs(prepared.module, inputs);
  const trace: DebugTrace = { order: [], intermediate: {}, timing_us: {}, total_us: 0 };
  const tStart = performance.now();

  for (const block of prepared.order) {
    const before = snapshotVars(vars);
    const start = performance.now();
    try {
      evalPreparedBlock(block, vars, reg);
    } catch (e) {
      if (e instanceof RunError) e.loc = { ...e.loc, block: block.id };
      throw e;
    }
    const elapsed = performance.now() - start;
    const after = snapshotVars(vars);
    trace.order.push(block.id);
    trace.intermediate[block.id] = {
      block_kind: block.kind,
      before,
      after,
      delta: diffVars(before, after),
    };
    trace.timing_us[block.id] = Math.round(elapsed * 1000);
  }

  trace.total_us = Math.round((performance.now() - tStart) * 1000);

  const result: Outputs = {};
  for (const name of prepared.module.outputs) {
    if (!(name in vars)) throw new RunError('R2_OUTPUT_MISSING', `module output '${name}' not produced`);
    result[name] = serialize(vars[name]);
  }
  return { result, trace };
}
