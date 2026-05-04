import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const m: Module = {
  name: 'demo',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'price', type: 'dec' },
    { name: 'qty', type: 'num' },
  ],
  outputs: ['total'],
  blocks: [
    { id: 'sub', out: ['subtotal', 'dec'], expr: '$price * $qty' },
    { id: 'tax', out: ['tax', 'dec'], expr: '$subtotal * 0.07' },
    { id: 'total', out: ['total', 'dec'], expr: 'currency_round($subtotal + $tax)' },
  ],
};

describe('scopeAt', () => {
  it('first block sees only inputs', () => {
    const s = rf.scopeAt(m, 'sub');
    expect(s.vars.sort()).toEqual(['price', 'qty']);
    expect(s.functions).toContain('currency_round');
    expect(s.functions).toContain('min');
  });

  it('mid block sees inputs + earlier outputs', () => {
    const s = rf.scopeAt(m, 'tax');
    expect(s.vars.sort()).toEqual(['price', 'qty', 'subtotal']);
  });

  it('last block sees everything before', () => {
    const s = rf.scopeAt(m, 'total');
    expect(s.vars.sort()).toEqual(['price', 'qty', 'subtotal', 'tax']);
  });

  it('functions include defaults + theme', () => {
    const s = rf.scopeAt(m, 'sub');
    expect(s.functions).toContain('pickIf');
    expect(s.functions).toContain('toNumber');
  });
});

describe('validateBlock', () => {
  it('valid formula block', () => {
    const r = rf.validateBlock(
      { id: 'b', out: ['y', 'num'], expr: '$x + 1' },
      { vars: ['x'], functions: [] },
    );
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('reports undefined var', () => {
    const r = rf.validateBlock(
      { id: 'b', out: ['y', 'num'], expr: '$missing + 1' },
      { vars: ['x'], functions: [] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toBe('S3_UNDEFINED_VAR');
  });

  it('reports unknown function', () => {
    const r = rf.validateBlock(
      { id: 'b', out: ['y', 'num'], expr: 'mystery_fn($x)' },
      { vars: ['x'], functions: ['min', 'max'] },
    );
    expect(r.errors.some((e) => e.code === 'S7_UNKNOWN_FUNC')).toBe(true);
  });

  it('reports parse error', () => {
    const r = rf.validateBlock(
      { id: 'b', out: ['y', 'num'], expr: '$x +' },
      { vars: ['x'], functions: [] },
    );
    expect(r.valid).toBe(false);
    expect(r.errors[0].code).toMatch(/S5/);
  });

  it('validates if-block branches', () => {
    const r = rf.validateBlock(
      {
        id: 'b',
        outs: [['grade', 'str', 'F']],
        branches: [
          ['$score >= 80', { grade: 'A' }],
          ['$missing > 0', { grade: 'B' }],
        ],
        else: {},
      },
      { vars: ['score'], functions: [] },
    );
    expect(r.errors.some((e) => e.code === 'S3_UNDEFINED_VAR')).toBe(true);
  });

  it('detects multi-kind block', () => {
    const r = rf.validateBlock(
      { id: 'b', out: ['y', 'num'], expr: '1', branches: [], else: {} } as never,
      { vars: [], functions: [] },
    );
    expect(r.errors.some((e) => e.code === 'S1_BLOCK_KIND_AMBIGUOUS')).toBe(true);
  });
});

describe('previewExpr', () => {
  it('eval expression with sample vars', () => {
    const r = rf.previewExpr('$x * 2 + 1', { x: 5 });
    expect(r.result).toBe(11);
    expect(r.error).toBeUndefined();
  });

  it('reports parse error', () => {
    const r = rf.previewExpr('$x +', {});
    expect(r.result).toBeUndefined();
    expect(r.error).toBeDefined();
  });

  it('reports runtime error', () => {
    const r = rf.previewExpr('$x / 0', { x: 5 });
    expect(r.error).toContain('R2_DIVIDE_BY_ZERO');
  });

  it('uses registered functions', () => {
    const r = rf.previewExpr('between($x, 1, 10)', { x: 5 });
    expect(r.result).toBe(true);
  });

  it('serializes Decimal result', () => {
    const r = rf.previewExpr('toDecimal("3.14") + 1', {});
    expect(r.result).toBe('4.14');
  });
});

describe('tryParseExpr', () => {
  it('returns AST on success', () => {
    const r = rf.tryParseExpr('$x + 1');
    expect(r.ast?.k).toBe('bin');
    expect(r.error).toBeUndefined();
  });

  it('returns error on syntax error', () => {
    const r = rf.tryParseExpr('$x +');
    expect(r.ast).toBeUndefined();
    expect(r.error).toBeDefined();
    expect(r.error?.code).toMatch(/S5|TOKENIZE/);
  });

  it('returns col position', () => {
    const r = rf.tryParseExpr('$x + @');
    expect(r.error?.pos).toBeGreaterThanOrEqual(0);
  });

  it('handles tokenize errors', () => {
    const r = rf.tryParseExpr("'unterminated");
    expect(r.error).toBeDefined();
    expect(r.error?.code).toBe('TOKENIZE');
  });

  it('handles bare identifier error', () => {
    const r = rf.tryParseExpr('foo');
    expect(r.error).toBeDefined();
  });
});

describe('completionAt', () => {
  const scope = { vars: ['age', 'amount', 'annual_income'], functions: ['min', 'max', 'between', 'mod'] };

  it('suggests vars after $', () => {
    const r = rf.completionAt('$', 1, scope);
    expect(r.kind).toBe('var');
    expect(r.suggestions.sort()).toEqual(['age', 'amount', 'annual_income']);
  });

  it('filters vars by prefix', () => {
    const r = rf.completionAt('$a', 2, scope);
    expect(r.kind).toBe('var');
    expect(r.prefix).toBe('a');
    expect(r.suggestions.sort()).toEqual(['age', 'amount', 'annual_income']);
  });

  it('filters more specific prefix', () => {
    const r = rf.completionAt('$ann', 4, scope);
    expect(r.suggestions).toEqual(['annual_income']);
  });

  it('suggests functions for bare identifier prefix', () => {
    const r = rf.completionAt('m', 1, scope);
    expect(r.kind).toBe('function');
    expect(r.suggestions.sort()).toEqual(['max', 'min', 'mod']);
  });

  it('filters function by prefix', () => {
    const r = rf.completionAt('be', 2, scope);
    expect(r.kind).toBe('function');
    expect(r.suggestions).toEqual(['between']);
  });

  it('inside expression: $x + a → suggests function starting with a', () => {
    const text = '$x + b';
    const r = rf.completionAt(text, text.length, scope);
    expect(r.kind).toBe('function');
    expect(r.suggestions).toEqual(['between']);
  });

  it('after operator: empty prefix → literal', () => {
    const r = rf.completionAt('$x + ', 5, scope);
    expect(r.kind).toBe('literal');
    expect(r.suggestions).toEqual([]);
  });

  it('empty string', () => {
    const r = rf.completionAt('', 0, scope);
    expect(r.kind).toBe('literal');
  });
});
