import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js-light';
import { parseExpr } from '../src/parser.js';
import { evalExpr } from '../src/evaluator.js';
import { FunctionRegistry, loadDefaults } from '../src/functions.js';
import { RunError } from '../src/errors.js';

function reg() {
  const r = new FunctionRegistry();
  loadDefaults(r);
  return r;
}

const e = (src: string, ctx: Record<string, unknown> = {}) => evalExpr(parseExpr(src), ctx, reg());

describe('expression eval — arithmetic', () => {
  it('basic ops', () => {
    expect(e('1 + 2 * 3')).toBe(7);
    expect(e('(1 + 2) * 3')).toBe(9);
    expect(e('10 / 4')).toBe(2.5);
    expect(e('10 % 3')).toBe(1);
    expect(e('2 ** 8')).toBe(256);
  });

  it('var lookup', () => {
    expect(e('$x + 1', { x: 5 })).toBe(6);
  });

  it('case-sensitive var', () => {
    expect(() => e('$Age', { age: 5 })).toThrow(RunError);
  });

  it('Decimal preserved', () => {
    const r = e('$x + 1', { x: new Decimal('100.5') });
    expect(r).toBeInstanceOf(Decimal);
    expect(String(r)).toBe('101.5');
  });

  it('Decimal precision', () => {
    const r = e('$x / 3', { x: new Decimal('10') });
    expect(String(r).startsWith('3.333')).toBe(true);
  });

  it('divide by zero', () => {
    expect(() => e('1 / 0')).toThrow(RunError);
    expect(() => e('1 % 0')).toThrow(RunError);
  });
});

describe('expression eval — compare', () => {
  it('numeric', () => {
    expect(e('5 > 3')).toBe(true);
    expect(e('5 == 5')).toBe(true);
    expect(e('5 != 4')).toBe(true);
    expect(e('5 <= 5')).toBe(true);
  });

  it('string lex order', () => {
    expect(e("'abc' < 'abd'")).toBe(true);
    expect(e("'2026-05-04' < '2026-05-09'")).toBe(true);
  });

  it('null compare', () => {
    expect(e('null == null')).toBe(true);
    expect(e('null != 5')).toBe(true);
  });
});

describe('expression eval — logic', () => {
  it('AND/OR', () => {
    expect(e('true AND false')).toBe(false);
    expect(e('true OR false')).toBe(true);
  });

  it('NOT', () => {
    expect(e('NOT true')).toBe(false);
    expect(e('NOT (5 > 10)')).toBe(true);
  });

  it('AND short-circuit', () => {
    let called = false;
    const r = reg();
    r.register({ name: 'spy', theme: 't', args: [], return: 'bool' }, () => {
      called = true;
      return true;
    });
    evalExpr(parseExpr('false AND spy()'), {}, r);
    expect(called).toBe(false);
  });

  it('non-bool operand → error', () => {
    expect(() => e('5 AND 3')).toThrow(RunError);
    expect(() => e('NOT 5')).toThrow(RunError);
  });
});

describe('expression eval — function call', () => {
  it('calls registered function', () => {
    expect(e('between(5, 1, 10)')).toBe(true);
  });

  it('unknown function throws', () => {
    expect(() => e('mystery_fn(1)')).toThrow(RunError);
  });

  it('function throw wrapped', () => {
    const r = reg();
    r.register({ name: 'boom', theme: 't', args: [], return: 'num' }, () => {
      throw new Error('boom');
    });
    expect(() => evalExpr(parseExpr('boom()'), {}, r)).toThrow(/R2_FUNC_THREW/);
  });
});

describe('expression eval — type strict', () => {
  it('no string + num implicit coerce', () => {
    expect(() => e("'5' + 3")).toThrow(RunError);
  });

  it('null operand in op', () => {
    expect(() => e('null + 1')).toThrow(RunError);
  });
});
