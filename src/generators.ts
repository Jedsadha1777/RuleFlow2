import type {
  AstNode,
  InputDecl,
  Module,
  PreparedBlock,
  PreparedModule,
  PreparedPayload,
  PreparedValue,
  PrimType,
} from './types.js';
import { ConfigError } from './errors.js';

export type SchemaFormat =
  | 'json-schema'
  | 'openapi'
  | 'typescript'
  | 'html-form'
  | 'react'
  | 'joi'
  | 'yup'
  | 'laravel';

export function generateSchema(module: Module, format: SchemaFormat): string {
  if (format === 'json-schema') return jsonSchema(module);
  if (format === 'openapi') return openApiSchema(module);
  if (format === 'typescript') return typescriptInterface(module);
  if (format === 'html-form') return htmlForm(module);
  if (format === 'react') return reactComponent(module);
  if (format === 'joi') return joiSchema(module);
  if (format === 'yup') return yupSchema(module);
  if (format === 'laravel') return laravelRules(module);
  throw new ConfigError('S8_UNKNOWN_FORMAT', `unknown schema format '${format}'`);
}

function jsonTypeFor(t: PrimType): string {
  if (t === 'num') return 'number';
  if (t === 'dec') return 'string';
  if (t === 'bool') return 'boolean';
  if (t === 'date' || t === 'time' || t === 'datetime' || t === 'str') return 'string';
  return 'null';
}

function jsonFormatFor(t: PrimType): string | undefined {
  if (t === 'date') return 'date';
  if (t === 'time') return 'time';
  if (t === 'datetime') return 'date-time';
  if (t === 'dec') return 'decimal';
  return undefined;
}

function jsonSchema(module: Module): string {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const inp of module.inputs) {
    const prop: Record<string, unknown> = { type: jsonTypeFor(inp.type) };
    const fmt = jsonFormatFor(inp.type);
    if (fmt) prop.format = fmt;
    if (inp.enum) prop.enum = inp.enum;
    if (inp.min !== undefined) prop.minimum = Number(inp.min);
    if (inp.max !== undefined) prop.maximum = Number(inp.max);
    properties[inp.name] = prop;
    if (!inp.nullable) required.push(inp.name);
  }
  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    title: module.name,
    type: 'object',
    properties,
    required,
  };
  return JSON.stringify(schema, null, 2);
}

function openApiSchema(module: Module): string {
  const properties: Record<string, Record<string, unknown>> = {};
  const required: string[] = [];
  for (const inp of module.inputs) {
    const prop: Record<string, unknown> = { type: jsonTypeFor(inp.type) };
    const fmt = jsonFormatFor(inp.type);
    if (fmt) prop.format = fmt;
    if (inp.enum) prop.enum = inp.enum;
    if (inp.min !== undefined) prop.minimum = Number(inp.min);
    if (inp.max !== undefined) prop.maximum = Number(inp.max);
    properties[inp.name] = prop;
    if (!inp.nullable) required.push(inp.name);
  }
  const schema = {
    components: {
      schemas: {
        [module.name]: {
          type: 'object',
          properties,
          required,
        },
      },
    },
  };
  return JSON.stringify(schema, null, 2);
}

function tsTypeFor(t: PrimType): string {
  if (t === 'num') return 'number';
  if (t === 'bool') return 'boolean';
  return 'string';
}

function typescriptInterface(module: Module): string {
  const lines: string[] = [];
  const inputName = `${pascalCase(module.name)}Inputs`;
  const outputName = `${pascalCase(module.name)}Outputs`;
  lines.push(`export interface ${inputName} {`);
  for (const inp of module.inputs) {
    const opt = inp.nullable ? '?' : '';
    lines.push(`  ${inp.name}${opt}: ${tsTypeFor(inp.type)};`);
  }
  lines.push('}');
  lines.push('');
  lines.push(`export interface ${outputName} {`);
  for (const out of module.outputs) {
    lines.push(`  ${out}: unknown;`);
  }
  lines.push('}');
  return lines.join('\n');
}

function htmlInputFor(inp: InputDecl): string {
  const required = inp.nullable ? '' : ' required';
  const lbl = `<label for="${inp.name}">${inp.name}</label>`;
  if (inp.type === 'bool') {
    return `${lbl}<input id="${inp.name}" name="${inp.name}" type="checkbox"${required}>`;
  }
  if (inp.enum) {
    const opts = inp.enum.map((v) => `<option value="${v}">${v}</option>`).join('');
    return `${lbl}<select id="${inp.name}" name="${inp.name}"${required}>${opts}</select>`;
  }
  if (inp.type === 'date') return `${lbl}<input id="${inp.name}" name="${inp.name}" type="date"${required}>`;
  if (inp.type === 'time') return `${lbl}<input id="${inp.name}" name="${inp.name}" type="time"${required}>`;
  if (inp.type === 'datetime') return `${lbl}<input id="${inp.name}" name="${inp.name}" type="datetime-local"${required}>`;
  if (inp.type === 'num' || inp.type === 'dec') {
    const min = inp.min !== undefined ? ` min="${inp.min}"` : '';
    const max = inp.max !== undefined ? ` max="${inp.max}"` : '';
    const step = inp.type === 'num' ? '' : ' step="any"';
    return `${lbl}<input id="${inp.name}" name="${inp.name}" type="number"${min}${max}${step}${required}>`;
  }
  return `${lbl}<input id="${inp.name}" name="${inp.name}" type="text"${required}>`;
}

function htmlForm(module: Module): string {
  const lines: string[] = [`<form name="${module.name}">`];
  for (const inp of module.inputs) lines.push(`  ${htmlInputFor(inp)}`);
  lines.push('  <button type="submit">Submit</button>');
  lines.push('</form>');
  return lines.join('\n');
}

function reactComponent(module: Module): string {
  const compName = pascalCase(module.name) + 'Form';
  const lines: string[] = [];
  lines.push(`export function ${compName}() {`);
  lines.push(`  return (`);
  lines.push(`    <form name="${module.name}">`);
  for (const inp of module.inputs) {
    const required = inp.nullable ? '' : ' required';
    if (inp.type === 'bool') {
      lines.push(`      <label>${inp.name}<input type="checkbox" name="${inp.name}"${required} /></label>`);
    } else if (inp.enum) {
      const opts = inp.enum.map((v) => `<option value="${v}">${v}</option>`).join('');
      lines.push(`      <label>${inp.name}<select name="${inp.name}"${required}>${opts}</select></label>`);
    } else if (inp.type === 'date') {
      lines.push(`      <label>${inp.name}<input type="date" name="${inp.name}"${required} /></label>`);
    } else if (inp.type === 'num' || inp.type === 'dec') {
      const minA = inp.min !== undefined ? ` min={${inp.min}}` : '';
      const maxA = inp.max !== undefined ? ` max={${inp.max}}` : '';
      lines.push(`      <label>${inp.name}<input type="number"${minA}${maxA} name="${inp.name}"${required} /></label>`);
    } else {
      lines.push(`      <label>${inp.name}<input type="text" name="${inp.name}"${required} /></label>`);
    }
  }
  lines.push(`      <button type="submit">Submit</button>`);
  lines.push(`    </form>`);
  lines.push(`  );`);
  lines.push(`}`);
  return lines.join('\n');
}

function joiSchema(module: Module): string {
  const lines: string[] = ["import Joi from 'joi';", ''];
  lines.push(`export const ${camelCase(module.name)}Schema = Joi.object({`);
  for (const inp of module.inputs) {
    let s = '';
    if (inp.type === 'num') s = 'Joi.number()';
    else if (inp.type === 'dec') s = 'Joi.string()';
    else if (inp.type === 'bool') s = 'Joi.boolean()';
    else if (inp.type === 'date') s = "Joi.string().pattern(new RegExp('^\\\\d{4}-\\\\d{2}-\\\\d{2}$'))";
    else s = 'Joi.string()';
    if (inp.enum) s += `.valid(${inp.enum.map((v) => JSON.stringify(v)).join(', ')})`;
    if (inp.min !== undefined && (inp.type === 'num' || inp.type === 'dec')) s += `.min(${inp.min})`;
    if (inp.max !== undefined && (inp.type === 'num' || inp.type === 'dec')) s += `.max(${inp.max})`;
    s += inp.nullable ? '.optional()' : '.required()';
    lines.push(`  ${inp.name}: ${s},`);
  }
  lines.push('});');
  return lines.join('\n');
}

function yupSchema(module: Module): string {
  const lines: string[] = ["import * as yup from 'yup';", ''];
  lines.push(`export const ${camelCase(module.name)}Schema = yup.object({`);
  for (const inp of module.inputs) {
    let s = '';
    if (inp.type === 'num') s = 'yup.number()';
    else if (inp.type === 'dec') s = 'yup.string()';
    else if (inp.type === 'bool') s = 'yup.boolean()';
    else s = 'yup.string()';
    if (inp.enum) s += `.oneOf([${inp.enum.map((v) => JSON.stringify(v)).join(', ')}])`;
    if (inp.min !== undefined && inp.type === 'num') s += `.min(${inp.min})`;
    if (inp.max !== undefined && inp.type === 'num') s += `.max(${inp.max})`;
    s += inp.nullable ? '.notRequired()' : '.required()';
    lines.push(`  ${inp.name}: ${s},`);
  }
  lines.push('});');
  return lines.join('\n');
}

function laravelRules(module: Module): string {
  const rules: Record<string, string> = {};
  for (const inp of module.inputs) {
    const parts: string[] = inp.nullable ? ['nullable'] : ['required'];
    if (inp.type === 'num') parts.push('numeric');
    else if (inp.type === 'dec') parts.push('numeric');
    else if (inp.type === 'bool') parts.push('boolean');
    else if (inp.type === 'date') parts.push('date_format:Y-m-d');
    else if (inp.type === 'time') parts.push('date_format:H:i:s');
    else if (inp.type === 'datetime') parts.push('date');
    else parts.push('string');
    if (inp.enum) parts.push(`in:${inp.enum.join(',')}`);
    if (inp.min !== undefined) parts.push(`min:${inp.min}`);
    if (inp.max !== undefined) parts.push(`max:${inp.max}`);
    rules[inp.name] = parts.join('|');
  }
  return JSON.stringify(rules, null, 2);
}

function pascalCase(s: string): string {
  return s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

function camelCase(s: string): string {
  const p = pascalCase(s);
  return p.charAt(0).toLowerCase() + p.slice(1);
}

export function generateDocs(module: Module): string {
  const lines: string[] = [];
  lines.push(`# ${module.name} (v${module.ver})`);
  lines.push('');
  if (module.meta?.description) lines.push(String(module.meta.description));
  lines.push('');

  lines.push('## Inputs');
  lines.push('');
  lines.push('| Name | Type | Required | Constraints |');
  lines.push('|---|---|---|---|');
  for (const inp of module.inputs) {
    const constraints: string[] = [];
    if (inp.enum) constraints.push(`enum: ${inp.enum.join(', ')}`);
    if (inp.min !== undefined) constraints.push(`min: ${inp.min}`);
    if (inp.max !== undefined) constraints.push(`max: ${inp.max}`);
    lines.push(`| \`${inp.name}\` | ${inp.type} | ${inp.nullable ? 'no' : 'yes'} | ${constraints.join(', ') || '—'} |`);
  }
  lines.push('');

  lines.push('## Outputs');
  lines.push('');
  for (const out of module.outputs) lines.push(`- \`${out}\``);
  lines.push('');

  lines.push('## Blocks');
  lines.push('');
  for (const b of module.blocks) {
    const kind = blockKindOf(b);
    lines.push(`### \`${b.id}\` (${kind})`);
    if (kind === 'formula' && 'expr' in b) {
      lines.push('');
      lines.push(`Output: \`${b.out[0]}\` (${b.out[1]})`);
      lines.push('');
      lines.push('```');
      lines.push(b.expr);
      lines.push('```');
    } else if (kind === 'if' && 'branches' in b) {
      lines.push('');
      lines.push(`Outputs: ${b.outs.map((o) => `\`${o[0]}\``).join(', ')}`);
      for (const [cond] of b.branches) lines.push(`- if \`${cond}\``);
      lines.push('- else (fallback)');
    } else if (kind === 'switch' && 'cases' in b) {
      lines.push('');
      lines.push(`On: \`${b.on}\``);
      lines.push(`Outputs: ${b.outs.map((o) => `\`${o[0]}\``).join(', ')}`);
      for (const [val] of b.cases) lines.push(`- case \`${String(val)}\``);
      lines.push('- default (fallback)');
    } else if (kind === 'table' && 'table' in b) {
      lines.push('');
      lines.push(`Table: ${b.table.join(' × ')}`);
      lines.push(`Outputs: ${b.outs.map((o) => `\`${o[0]}\``).join(', ')}`);
      lines.push(`Rows: ${b.rows.length}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function blockKindOf(b: Module['blocks'][0]): 'formula' | 'if' | 'switch' | 'table' {
  if ('expr' in b) return 'formula';
  if ('branches' in b) return 'if';
  if ('cases' in b) return 'switch';
  if ('table' in b) return 'table';
  throw new ConfigError('S1_BLOCK_KIND_MISSING', `block has no kind`);
}

export interface CodeGenOpts {
  target?: 'ts' | 'js';
  function_name?: string;
  include_comments?: boolean;
}

export function generateCode(prepared: PreparedModule, opts: CodeGenOpts = {}): string {
  const fnName = opts.function_name ?? camelCase(prepared.module.name);
  const includeComments = opts.include_comments !== false;

  const lines: string[] = [];
  lines.push(`// Generated from ${prepared.module.name} v${prepared.module.ver}`);
  lines.push(`import Decimal from 'decimal.js-light';`);
  lines.push('');
  lines.push(`export function ${fnName}(inputs, fn) {`);
  lines.push(`  const v = { ...inputs };`);

  for (const block of prepared.order) {
    if (includeComments) lines.push(`  // ${block.id} (${block.kind})`);
    emitBlockCode(block, lines, '  ');
  }

  lines.push(`  return {`);
  for (const out of prepared.module.outputs) {
    lines.push(`    ${out}: __ser(v.${out}),`);
  }
  lines.push(`  };`);
  lines.push(`}`);
  lines.push('');
  lines.push(`function __ser(x) {`);
  lines.push(`  if (x instanceof Decimal) return x.toString();`);
  lines.push(`  return x;`);
  lines.push(`}`);

  return lines.join('\n');
}

function emitBlockCode(block: PreparedBlock, lines: string[], indent: string): void {
  if (block.kind === 'formula') {
    lines.push(`${indent}v.${block.outName} = __coerce(${exprCode(block.expr)}, '${block.outType}');`);
    return;
  }
  if (block.kind === 'if') {
    for (const o of block.outs) {
      lines.push(`${indent}v.${o.name} = ${literalLiteral(o.fallback)};`);
    }
    let first = true;
    for (const branch of block.branches) {
      const keyword = first ? 'if' : 'else if';
      lines.push(`${indent}${keyword} (${exprCode(branch.cond)}) {`);
      emitPayloadCode(branch.payload, lines, indent + '  ');
      lines.push(`${indent}}`);
      first = false;
    }
    if (block.else.kind === 'set' && block.else.entries.length > 0) {
      lines.push(`${indent}else {`);
      emitPayloadCode(block.else, lines, indent + '  ');
      lines.push(`${indent}}`);
    } else if (block.else.kind === 'blocks' && block.else.blocks.length > 0) {
      lines.push(`${indent}else {`);
      emitPayloadCode(block.else, lines, indent + '  ');
      lines.push(`${indent}}`);
    }
    return;
  }
  if (block.kind === 'switch') {
    for (const o of block.outs) {
      lines.push(`${indent}v.${o.name} = ${literalLiteral(o.fallback)};`);
    }
    lines.push(`${indent}switch (v.${block.on}) {`);
    for (const c of block.cases) {
      lines.push(`${indent}  case ${literalLiteral(c.value)}: {`);
      emitPayloadCode(c.payload, lines, indent + '    ');
      lines.push(`${indent}    break;`);
      lines.push(`${indent}  }`);
    }
    if (block.default.kind === 'set' && block.default.entries.length > 0) {
      lines.push(`${indent}  default: {`);
      emitPayloadCode(block.default, lines, indent + '    ');
      lines.push(`${indent}    break;`);
      lines.push(`${indent}  }`);
    }
    lines.push(`${indent}}`);
    return;
  }
  // table
  for (const o of block.outs) {
    lines.push(`${indent}v.${o.name} = ${literalLiteral(o.fallback)};`);
  }
  for (let i = 0; i < block.rows.length; i++) {
    const row = block.rows[i];
    const conds: string[] = [];
    for (let c = 0; c < row.cells.length; c++) {
      const cell = row.cells[c];
      const colName = block.table[c];
      if (cell.k === 'wildcard') continue;
      if (cell.k === 'literal') conds.push(`v.${colName} === ${literalLiteral(cell.value)}`);
      else if (cell.k === 'cmp') conds.push(`Number(v.${colName}) ${cell.op} ${cell.value}`);
      else conds.push(`Number(v.${colName}) >= ${cell.lo} && Number(v.${colName}) <= ${cell.hi}`);
    }
    const condCode = conds.length === 0 ? 'true' : conds.join(' && ');
    const kw = i === 0 ? 'if' : 'else if';
    lines.push(`${indent}${kw} (${condCode}) {`);
    emitPayloadCode(row.payload, lines, indent + '  ');
    lines.push(`${indent}}`);
  }
  if (block.default.kind === 'set' && block.default.entries.length > 0) {
    lines.push(`${indent}else {`);
    emitPayloadCode(block.default, lines, indent + '  ');
    lines.push(`${indent}}`);
  }
}

function emitPayloadCode(p: PreparedPayload, lines: string[], indent: string): void {
  if (p.kind === 'blocks') {
    for (const sub of p.blocks) emitBlockCode(sub, lines, indent);
    return;
  }
  for (const e of p.entries) {
    lines.push(`${indent}v.${e.output} = __coerce(${preparedValueCode(e.value)}, '${e.type}');`);
  }
}

function preparedValueCode(v: PreparedValue): string {
  if (v.kind === 'literal') return literalLiteral(v.value);
  return exprCode(v.ast);
}

function literalLiteral(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return String(v);
  if (v instanceof Object && 'toString' in v && typeof (v as { toString: () => string }).toString === 'function') {
    const s = (v as { toString: () => string }).toString();
    if (typeof s === 'string') {
      const isNumeric = !Number.isNaN(Number(s)) && s.length > 0;
      if (isNumeric && v.constructor && v.constructor.name === 'Decimal') {
        return `new Decimal(${JSON.stringify(s)})`;
      }
      return JSON.stringify(s);
    }
  }
  return JSON.stringify(v);
}

function exprCode(ast: AstNode): string {
  if (ast.k === 'lit') {
    if (ast.value === null) return 'null';
    if (ast.type === 'str') return JSON.stringify(ast.value);
    if (ast.type === 'bool') return String(ast.value);
    return String(ast.value);
  }
  if (ast.k === 'var') return `v.${ast.name}`;
  if (ast.k === 'bin') return `(${binCode(ast.op, ast.left, ast.right)})`;
  if (ast.k === 'un') {
    if (ast.op === '-') return `(-${exprCode(ast.operand)})`;
    return `(!${exprCode(ast.operand)})`;
  }
  if (ast.k === 'cmp') return `(${exprCode(ast.left)} ${ast.op} ${exprCode(ast.right)})`;
  if (ast.k === 'logic') {
    if (ast.op === 'NOT') return `(!${exprCode(ast.operands[0])})`;
    const sep = ast.op === 'AND' ? ' && ' : ' || ';
    return `(${ast.operands.map(exprCode).join(sep)})`;
  }
  return `fn.${ast.name}(${ast.args.map(exprCode).join(', ')})`;
}

function binCode(op: string, l: AstNode, r: AstNode): string {
  if (op === '**') return `Math.pow(${exprCode(l)}, ${exprCode(r)})`;
  return `${exprCode(l)} ${op} ${exprCode(r)}`;
}
