import type {
  AstNode,
  Block,
  ConfigErrorObj,
  Inputs,
  Module,
  Outputs,
  Payload,
  PreparedModule,
  ValidationResult,
  WarningObj,
} from './types.js';
import { ConfigError } from './errors.js';
import { collectFuncCalls, collectVarRefs, parseCellPattern, parseExpr } from './parser.js';
import { FunctionRegistry } from './functions.js';
import { isValidIdent } from './util.js';
import { coerceInput, evalModule } from './evaluator.js';

export function validateModule(module: Module, reg: FunctionRegistry): ValidationResult {
  const errors: ConfigErrorObj[] = [];
  const warnings: WarningObj[] = [];

  if (!module.name) errors.push(makeErr('S1_SCHEMA_SHAPE', 'module missing name'));
  if (!module.ver) errors.push(makeErr('S1_SCHEMA_SHAPE', 'module missing ver'));
  if (!Array.isArray(module.inputs)) errors.push(makeErr('S1_SCHEMA_SHAPE', 'module.inputs must be array'));
  if (!Array.isArray(module.outputs)) errors.push(makeErr('S1_SCHEMA_SHAPE', 'module.outputs must be array'));
  if (!Array.isArray(module.blocks)) errors.push(makeErr('S1_SCHEMA_SHAPE', 'module.blocks must be array'));

  if (errors.length > 0) {
    return { valid: false, errors, warnings, meta: { total_blocks: 0, required_inputs: [] } };
  }

  const allBlocks = collectAllBlocks(module.blocks);

  const ids = new Set<string>();
  for (const b of allBlocks) {
    if (ids.has(b.id)) errors.push(makeErr('S2_DUPLICATE_ID', `block id '${b.id}' duplicated`, { block: b.id }));
    ids.add(b.id);
    const kindCount = ['expr' in b, 'branches' in b, 'cases' in b, 'table' in b].filter(Boolean).length;
    if (kindCount === 0) errors.push(makeErr('S1_BLOCK_KIND_MISSING', `block '${b.id}' has no expr/branches/cases/table`, { block: b.id }));
    if (kindCount > 1) errors.push(makeErr('S1_BLOCK_KIND_AMBIGUOUS', `block '${b.id}' has multiple kinds`, { block: b.id }));
  }

  const inputNames = new Set<string>();
  for (const inp of module.inputs) {
    if (inputNames.has(inp.name)) errors.push(makeErr('S2_DUPLICATE_ID', `input '${inp.name}' duplicated`));
    inputNames.add(inp.name);
  }

  const allOutputs = new Set<string>();
  for (const b of allBlocks) for (const o of outputsOf(b)) allOutputs.add(o);

  for (const inpName of inputNames) {
    if (allOutputs.has(inpName)) errors.push(makeErr('S3_SHADOWING', `input '${inpName}' shadows block output`));
  }

  for (const b of allBlocks) {
    const refs = collectBlockRefs(b);
    for (const r of refs) {
      if (!inputNames.has(r) && !allOutputs.has(r)) {
        errors.push(makeErr('S3_UNDEFINED_VAR', `'$${r}' in block '${b.id}' not in scope`, { block: b.id }));
      }
    }
  }

  try {
    detectCycle(module);
  } catch (e) {
    if (e instanceof ConfigError) errors.push({ code: e.code, message: e.message, loc: e.loc });
  }

  validateExpressions(allBlocks, reg, errors);
  validateBlockSpecifics(allBlocks, errors);

  for (const out of module.outputs) {
    if (!allOutputs.has(out) && !inputNames.has(out)) {
      errors.push(makeErr('S8_OUTPUT_NOT_PRODUCED', `module output '${out}' not produced by any block`));
    }
  }

  collectLintWarnings(allBlocks, warnings);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    meta: {
      total_blocks: allBlocks.length,
      required_inputs: module.inputs.filter((i) => !i.nullable).map((i) => i.name),
    },
  };
}

function makeErr(code: string, message: string, loc?: { block?: string; field?: string; path?: string }): ConfigErrorObj {
  return { code, message, loc };
}

function collectAllBlocks(blocks: Block[]): Block[] {
  const all: Block[] = [];
  for (const b of blocks) {
    all.push(b);
    all.push(...collectAllBlocks(nestedBlocks(b)));
  }
  return all;
}

function nestedBlocks(b: Block): Block[] {
  const out: Block[] = [];
  const fromPayload = (p: Payload | undefined) => {
    if (!p) return;
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

function outputsOf(b: Block): string[] {
  if ('out' in b) return [b.out[0]];
  if ('outs' in b) return b.outs.map((o) => o[0]);
  return [];
}

function collectBlockRefs(b: Block): Set<string> {
  const refs = new Set<string>();
  const fromExpr = (s: string) => {
    try {
      for (const r of collectVarRefs(parseExpr(s))) refs.add(r);
    } catch {
      // unparseable strings are handled at expression validation
    }
  };
  const fromValue = (v: unknown) => {
    if (typeof v === 'string') fromExpr(v);
  };
  const fromPayload = (p: Payload | undefined) => {
    if (!p) return;
    if (Array.isArray(p)) return;
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

function detectCycle(module: Module): void {
  const inputs = new Set(module.inputs.map((i) => i.name));
  const ownerByOutput = new Map<string, string>();
  for (const b of module.blocks) {
    for (const o of outputsOf(b)) ownerByOutput.set(o, b.id);
  }
  const deps = new Map<string, Set<string>>();
  for (const b of module.blocks) {
    const refs = collectBlockRefs(b);
    const dep = new Set<string>();
    for (const r of refs) {
      if (inputs.has(r)) continue;
      const owner = ownerByOutput.get(r);
      if (owner && owner !== b.id) dep.add(owner);
    }
    deps.set(b.id, dep);
  }

  const inDegree = new Map<string, number>();
  for (const id of deps.keys()) inDegree.set(id, deps.get(id)?.size ?? 0);

  const dependents = new Map<string, Set<string>>();
  for (const id of deps.keys()) dependents.set(id, new Set());
  for (const [id, ds] of deps) for (const d of ds) dependents.get(d)?.add(id);

  const queue: string[] = [];
  for (const [id, deg] of inDegree) if (deg === 0) queue.push(id);

  let processed = 0;
  while (queue.length > 0) {
    const id = queue.shift() as string;
    processed++;
    for (const dep of dependents.get(id) ?? []) {
      const d = (inDegree.get(dep) ?? 0) - 1;
      inDegree.set(dep, d);
      if (d === 0) queue.push(dep);
    }
  }
  if (processed !== module.blocks.length) {
    const remaining: string[] = [];
    for (const [id, deg] of inDegree) if (deg !== 0) remaining.push(id);
    throw new ConfigError('S4_CYCLE', `cycle detected: ${remaining.join(', ')}`);
  }
}

function validateExpressions(blocks: Block[], reg: FunctionRegistry, errors: ConfigErrorObj[]): void {
  const checkExpr = (s: string, blockId: string) => {
    let ast: AstNode;
    try {
      ast = parseExpr(s);
    } catch (e) {
      if (e instanceof ConfigError) {
        errors.push({ code: e.code, message: e.message, loc: { block: blockId } });
      }
      return;
    }
    for (const fn of collectFuncCalls(ast)) {
      if (!reg.has(fn)) {
        errors.push(makeErr('S7_UNKNOWN_FUNC', `unknown function '${fn}' in '${blockId}'`, { block: blockId }));
      }
    }
  };

  for (const b of blocks) {
    if ('expr' in b) checkExpr(b.expr, b.id);
    if ('branches' in b) for (const [cond] of b.branches) checkExpr(cond, b.id);
  }
}

function validateBlockSpecifics(blocks: Block[], errors: ConfigErrorObj[]): void {
  for (const b of blocks) {
    if ('branches' in b) {
      for (const [name, , fb] of b.outs) {
        if (fb === undefined) errors.push(makeErr('S6_MISSING_FALLBACK', `output '${name}' missing fallback`, { block: b.id }));
      }
      if (b.else === undefined) errors.push(makeErr('S6_MISSING_ELSE', `block '${b.id}' missing else`, { block: b.id }));
    }
    if ('cases' in b) {
      for (const [name, , fb] of b.outs) {
        if (fb === undefined) errors.push(makeErr('S6_MISSING_FALLBACK', `output '${name}' missing fallback`, { block: b.id }));
      }
      if (b.default === undefined) errors.push(makeErr('S6_MISSING_DEFAULT', `block '${b.id}' missing default`, { block: b.id }));
      const seen = new Set<unknown>();
      for (const [v] of b.cases) {
        if (seen.has(v)) errors.push(makeErr('S2_DUPLICATE_ID', `case value duplicated in '${b.id}'`, { block: b.id }));
        seen.add(v);
      }
      const onName = b.on.startsWith('$') ? b.on.slice(1) : b.on;
      if (!isValidIdent(onName)) errors.push(makeErr('S6_TABLE_INVALID_DIM', `'on' must be plain $var in '${b.id}'`, { block: b.id }));
    }
    if ('table' in b) {
      for (const v of b.table) {
        const name = v.startsWith('$') ? v.slice(1) : v;
        if (!isValidIdent(name)) errors.push(makeErr('S6_TABLE_INVALID_DIM', `table dim must be plain $var in '${b.id}'`, { block: b.id }));
      }
      if (b.rows.length === 0) errors.push(makeErr('S6_TABLE_EMPTY', `table '${b.id}' has no rows`, { block: b.id }));
      for (let i = 0; i < b.rows.length; i++) {
        if (b.rows[i].length !== b.table.length + 1) {
          errors.push(makeErr('S6_TABLE_ROW_LENGTH', `row ${i} in '${b.id}' has ${b.rows[i].length} cells, expected ${b.table.length + 1}`, { block: b.id }));
        }
      }
      const rowKeys = new Set<string>();
      for (let i = 0; i < b.rows.length; i++) {
        const cells = b.rows[i].slice(0, b.table.length);
        const key = JSON.stringify(cells);
        if (rowKeys.has(key)) errors.push(makeErr('S6_TABLE_DUPLICATE_ROW', `row ${i} duplicates pattern in '${b.id}'`, { block: b.id }));
        rowKeys.add(key);
      }
      for (const [name, , fb] of b.outs) {
        if (fb === undefined) errors.push(makeErr('S6_MISSING_FALLBACK', `output '${name}' missing fallback`, { block: b.id }));
      }
      if (b.default === undefined) errors.push(makeErr('S6_MISSING_DEFAULT', `table '${b.id}' missing default`, { block: b.id }));
    }
  }
}

function collectLintWarnings(blocks: Block[], warnings: WarningObj[]): void {
  for (const b of blocks) {
    if ('table' in b) {
      if (b.rows.length > 100) {
        warnings.push({ code: 'S10_TABLE_TOO_MANY_ROWS', message: `table '${b.id}' has ${b.rows.length} rows (>100)`, severity: 'warning', loc: { block: b.id } });
      }
      if (b.table.length > 5) {
        warnings.push({ code: 'S10_TABLE_TOO_MANY_DIMS', message: `table '${b.id}' has ${b.table.length} dims (>5)`, severity: 'warning', loc: { block: b.id } });
      }
    }
    if ('branches' in b) {
      if (b.branches.length > 10) {
        warnings.push({ code: 'S10_BRANCHES_TOO_MANY', message: `block '${b.id}' has ${b.branches.length} branches (>10)`, severity: 'warning', loc: { block: b.id } });
      }
    }
  }
}

const COVERAGE_LIMIT = 10000;

export function checkCoverage(module: Module): WarningObj[] {
  const warnings: WarningObj[] = [];
  const inputByName = new Map(module.inputs.map((i) => [i.name, i] as const));
  const allBlocks = collectAllBlocks(module.blocks);

  for (const b of allBlocks) {
    if (!('table' in b)) continue;
    const cols = b.table.map((v) => (v.startsWith('$') ? v.slice(1) : v));
    const valueSets: unknown[][] = [];
    let unconstrained = false;
    for (const col of cols) {
      const decl = inputByName.get(col);
      if (!decl) {
        unconstrained = true;
        break;
      }
      if (decl.type === 'bool') {
        valueSets.push([true, false]);
        continue;
      }
      if (decl.type === 'str') {
        if (!decl.enum) {
          unconstrained = true;
          break;
        }
        valueSets.push([...decl.enum]);
        continue;
      }
      if (decl.type === 'num' || decl.type === 'dec') {
        if (decl.min === undefined || decl.max === undefined) {
          unconstrained = true;
          break;
        }
        const lo = Number(decl.min);
        const hi = Number(decl.max);
        const span = hi - lo;
        if (Number.isInteger(lo) && Number.isInteger(hi) && span <= 100) {
          const arr: number[] = [];
          for (let v = lo; v <= hi; v++) arr.push(v);
          valueSets.push(arr);
        } else {
          valueSets.push([lo, (lo + hi) / 2, hi]);
        }
        continue;
      }
      unconstrained = true;
      break;
    }

    if (unconstrained) {
      warnings.push({
        code: 'S11_NO_COVERAGE',
        message: `coverage skipped for table '${b.id}' (column missing constraint)`,
        severity: 'info',
        loc: { block: b.id },
      });
      continue;
    }

    const total = valueSets.reduce((a, s) => a * s.length, 1);
    if (total > COVERAGE_LIMIT) {
      warnings.push({
        code: 'S11_COVERAGE_TOO_LARGE',
        message: `coverage skipped: ${total} combinations exceeds ${COVERAGE_LIMIT}`,
        severity: 'info',
        loc: { block: b.id },
      });
      continue;
    }

    const cellPatterns = b.rows.map((r) => r.slice(0, cols.length).map((c) => parseCellPattern(c)));
    const used = new Array(b.rows.length).fill(false);
    let coveredByDefault = 0;

    const indices = new Array(cols.length).fill(0);
    while (true) {
      const combo = indices.map((idx, i) => valueSets[i][idx]);
      let matched = false;
      for (let r = 0; r < cellPatterns.length; r++) {
        if (matchAllCells(cellPatterns[r], combo)) {
          used[r] = true;
          matched = true;
          break;
        }
      }
      if (!matched) coveredByDefault++;

      let i = indices.length - 1;
      while (i >= 0) {
        indices[i]++;
        if (indices[i] < valueSets[i].length) break;
        indices[i] = 0;
        i--;
      }
      if (i < 0) break;
    }

    const defaultIsFallback = !Array.isArray(b.default) && Object.keys(b.default).length === 0;
    if (coveredByDefault > 0 && defaultIsFallback) {
      warnings.push({
        code: 'S11_COVERAGE_GAP',
        message: `table '${b.id}': ${coveredByDefault}/${total} combinations fall through to default (using fallback)`,
        severity: 'warning',
        loc: { block: b.id },
      });
    }
    for (let r = 0; r < used.length; r++) {
      if (!used[r]) {
        warnings.push({
          code: 'S11_DEAD_ROW',
          message: `table '${b.id}' row ${r} never matches any combination`,
          severity: 'warning',
          loc: { block: b.id },
        });
      }
    }
  }
  return warnings;
}

export interface FieldResult {
  valid: boolean;
  converted: unknown;
  type: string;
  errors: string[];
  warnings: string[];
}

export interface PartialResult {
  valid: boolean;
  errors: ConfigErrorObj[];
  missing_required: string[];
  warnings: WarningObj[];
}

export interface FormStatus {
  ready_to_submit: boolean;
  score: number;
  field_validation: {
    valid: boolean;
    missing_required: string[];
    progress: number;
  };
  summary: {
    total: number;
    provided: number;
    missing: number;
    invalid: number;
  };
}

export interface PreviewResult {
  outputs?: Outputs;
  error?: string;
  missing_required: string[];
  ready: boolean;
}

export function validateField(name: string, value: unknown, module: Module): FieldResult {
  const decl = module.inputs.find((i) => i.name === name);
  if (!decl) {
    return { valid: false, converted: null, type: 'unknown', errors: [`unknown field '${name}'`], warnings: [] };
  }
  if (value === null || value === undefined) {
    if (decl.nullable) return { valid: true, converted: null, type: decl.type, errors: [], warnings: [] };
    return { valid: false, converted: null, type: decl.type, errors: ['required'], warnings: [] };
  }
  try {
    const converted = coerceInput(value, decl.type, name);
    const errors: string[] = [];
    if (decl.enum && decl.type === 'str' && !decl.enum.includes(converted as string)) {
      errors.push(`value must be one of: ${decl.enum.join(', ')}`);
    }
    if ((decl.type === 'num' || decl.type === 'dec') && (decl.min !== undefined || decl.max !== undefined)) {
      const n = decl.type === 'dec' ? Number(String(converted)) : (converted as number);
      if (decl.min !== undefined && n < Number(decl.min)) errors.push(`min ${decl.min}`);
      if (decl.max !== undefined && n > Number(decl.max)) errors.push(`max ${decl.max}`);
    }
    return { valid: errors.length === 0, converted, type: decl.type, errors, warnings: [] };
  } catch (e) {
    return {
      valid: false,
      converted: null,
      type: decl.type,
      errors: [e instanceof Error ? e.message : String(e)],
      warnings: [],
    };
  }
}

export function validatePartial(inputs: Inputs, module: Module): PartialResult {
  const errors: ConfigErrorObj[] = [];
  const missing_required: string[] = [];

  for (const decl of module.inputs) {
    const present = decl.name in inputs && inputs[decl.name] !== null && inputs[decl.name] !== undefined;
    if (!present) {
      if (!decl.nullable) missing_required.push(decl.name);
      continue;
    }
    const fr = validateField(decl.name, inputs[decl.name], module);
    if (!fr.valid) {
      for (const err of fr.errors) {
        errors.push({ code: 'R1_FIELD_INVALID', message: `${decl.name}: ${err}`, loc: { field: decl.name } });
      }
    }
  }

  return {
    valid: errors.length === 0 && missing_required.length === 0,
    errors,
    missing_required,
    warnings: [],
  };
}

export function validationStatus(inputs: Inputs, module: Module): FormStatus {
  const total = module.inputs.length;
  let provided = 0;
  let missing = 0;
  let invalid = 0;
  const missing_required: string[] = [];

  for (const decl of module.inputs) {
    const present = decl.name in inputs && inputs[decl.name] !== null && inputs[decl.name] !== undefined;
    if (!present) {
      missing++;
      if (!decl.nullable) missing_required.push(decl.name);
      continue;
    }
    provided++;
    const fr = validateField(decl.name, inputs[decl.name], module);
    if (!fr.valid) invalid++;
  }

  const requiredCount = module.inputs.filter((i) => !i.nullable).length;
  const requiredProvided = requiredCount - missing_required.length;
  const progress = requiredCount === 0 ? 100 : Math.round((requiredProvided / requiredCount) * 100);
  const score = total === 0 ? 100 : Math.round(((provided - invalid) / total) * 100);

  return {
    ready_to_submit: missing_required.length === 0 && invalid === 0,
    score,
    field_validation: {
      valid: invalid === 0 && missing_required.length === 0,
      missing_required,
      progress,
    },
    summary: { total, provided, missing, invalid },
  };
}

export function livePreview(prepared: PreparedModule, inputs: Inputs, reg: FunctionRegistry): PreviewResult {
  const partial = validatePartial(inputs, prepared.module);
  if (!partial.valid) {
    return {
      missing_required: partial.missing_required,
      ready: false,
      error: partial.errors.length > 0 ? partial.errors[0].message : undefined,
    };
  }
  try {
    const outputs = evalModule(prepared, inputs, reg);
    return { outputs, missing_required: [], ready: true };
  } catch (e) {
    return {
      missing_required: [],
      ready: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

export function fieldSuggestions(name: string, module: Module, query?: string): string[] {
  const decl = module.inputs.find((i) => i.name === name);
  if (!decl) return [];
  if (decl.type === 'str' && decl.enum) {
    if (!query) return [...decl.enum];
    const q = query.toLowerCase();
    return decl.enum.filter((v) => v.toLowerCase().includes(q));
  }
  if (decl.type === 'bool') return ['true', 'false'];
  return [];
}

export function batchValidateFields(updates: Record<string, unknown>, current: Inputs, module: Module): Record<string, FieldResult> {
  const merged: Inputs = { ...current, ...updates };
  const out: Record<string, FieldResult> = {};
  for (const name of Object.keys(updates)) {
    out[name] = validateField(name, merged[name], module);
  }
  return out;
}

export interface BlockValidation {
  valid: boolean;
  errors: ConfigErrorObj[];
  warnings: WarningObj[];
}

export function validateBlock(block: Block, scope: { vars: string[]; functions: string[] }): BlockValidation {
  const errors: ConfigErrorObj[] = [];
  const warnings: WarningObj[] = [];

  const kindCount = ['expr' in block, 'branches' in block, 'cases' in block, 'table' in block].filter(Boolean).length;
  if (kindCount === 0) {
    errors.push({ code: 'S1_BLOCK_KIND_MISSING', message: `block '${block.id}' has no kind`, loc: { block: block.id } });
    return { valid: false, errors, warnings };
  }
  if (kindCount > 1) {
    errors.push({ code: 'S1_BLOCK_KIND_AMBIGUOUS', message: `block '${block.id}' has multiple kinds`, loc: { block: block.id } });
  }

  const knownVars = new Set(scope.vars);
  const knownFns = new Set(scope.functions);

  const checkExpr = (expr: string, field: string) => {
    let ast: AstNode;
    try {
      ast = parseExpr(expr);
    } catch (e) {
      if (e instanceof ConfigError) errors.push({ code: e.code, message: e.message, loc: { block: block.id, field } });
      return;
    }
    for (const v of collectVarRefs(ast)) {
      if (!knownVars.has(v)) {
        errors.push({ code: 'S3_UNDEFINED_VAR', message: `'$${v}' not in scope`, loc: { block: block.id, field } });
      }
    }
    for (const f of collectFuncCalls(ast)) {
      if (!knownFns.has(f)) {
        errors.push({ code: 'S7_UNKNOWN_FUNC', message: `unknown function '${f}'`, loc: { block: block.id, field } });
      }
    }
  };

  const checkValueString = (raw: unknown, field: string) => {
    if (typeof raw === 'string' && raw.length > 0 && (raw[0] === '$' || raw.includes('('))) {
      checkExpr(raw, field);
    }
  };

  if ('expr' in block) checkExpr(block.expr, 'expr');
  if ('branches' in block) {
    for (let i = 0; i < block.branches.length; i++) {
      const [cond, payload] = block.branches[i];
      checkExpr(cond, `branches[${i}].cond`);
      if (!Array.isArray(payload)) {
        for (const v of Object.values(payload)) checkValueString(v, `branches[${i}].set`);
      }
    }
    if (block.else === undefined) errors.push({ code: 'S6_MISSING_ELSE', message: 'missing else', loc: { block: block.id } });
  }
  if ('cases' in block) {
    const onName = block.on.startsWith('$') ? block.on.slice(1) : block.on;
    if (!isValidIdent(onName)) {
      errors.push({ code: 'S6_TABLE_INVALID_DIM', message: `'on' must be plain $var`, loc: { block: block.id, field: 'on' } });
    }
    if (!knownVars.has(onName)) {
      errors.push({ code: 'S3_UNDEFINED_VAR', message: `'$${onName}' not in scope`, loc: { block: block.id, field: 'on' } });
    }
    for (let i = 0; i < block.cases.length; i++) {
      const [, payload] = block.cases[i];
      if (!Array.isArray(payload)) {
        for (const v of Object.values(payload)) checkValueString(v, `cases[${i}].set`);
      }
    }
    if (block.default === undefined) errors.push({ code: 'S6_MISSING_DEFAULT', message: 'missing default', loc: { block: block.id } });
  }
  if ('table' in block) {
    for (const v of block.table) {
      const name = v.startsWith('$') ? v.slice(1) : v;
      if (!isValidIdent(name)) {
        errors.push({ code: 'S6_TABLE_INVALID_DIM', message: `table dim must be plain $var`, loc: { block: block.id } });
      }
      if (!knownVars.has(name)) {
        errors.push({ code: 'S3_UNDEFINED_VAR', message: `'$${name}' not in scope`, loc: { block: block.id } });
      }
    }
    if (block.rows.length === 0) errors.push({ code: 'S6_TABLE_EMPTY', message: 'no rows', loc: { block: block.id } });
    for (let i = 0; i < block.rows.length; i++) {
      if (block.rows[i].length !== block.table.length + 1) {
        errors.push({
          code: 'S6_TABLE_ROW_LENGTH',
          message: `row ${i} cell count mismatch`,
          loc: { block: block.id },
        });
      }
    }
    if (block.default === undefined) errors.push({ code: 'S6_MISSING_DEFAULT', message: 'missing default', loc: { block: block.id } });
  }

  return { valid: errors.length === 0, errors, warnings };
}

function matchAllCells(patterns: ReturnType<typeof parseCellPattern>[], values: unknown[]): boolean {
  for (let i = 0; i < patterns.length; i++) {
    const p = patterns[i];
    const v = values[i];
    if (p.k === 'wildcard') continue;
    if (p.k === 'literal') {
      if (p.value !== v) return false;
      continue;
    }
    if (typeof v !== 'number') return false;
    if (p.k === 'cmp') {
      if (p.op === '>') {
        if (!(v > p.value)) return false;
      } else if (p.op === '<') {
        if (!(v < p.value)) return false;
      } else if (p.op === '>=') {
        if (!(v >= p.value)) return false;
      } else if (p.op === '<=') {
        if (!(v <= p.value)) return false;
      } else if (p.op === '!=') {
        if (!(v !== p.value)) return false;
      }
      continue;
    }
    if (v < p.lo || v > p.hi) return false;
  }
  return true;
}
