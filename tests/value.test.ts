import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js-light';
import { prepareValue } from '../src/evaluator.js';
import { ConfigError } from '../src/errors.js';

describe('prepareValue — output type str', () => {
  it('plain string is literal', () => {
    expect(prepareValue('approved', 'str')).toEqual({ kind: 'literal', value: 'approved' });
  });

  it('starts with $ → expression', () => {
    const r = prepareValue('$other', 'str');
    expect(r.kind).toBe('expr');
  });

  it('function call → expression', () => {
    const r = prepareValue("concat($a, 'x')", 'str');
    expect(r.kind).toBe('expr');
  });
});

describe('prepareValue — output type num', () => {
  it('bare number is literal', () => {
    expect(prepareValue(25, 'num')).toEqual({ kind: 'literal', value: 25 });
  });

  it('numeric string is literal', () => {
    expect(prepareValue('3.5', 'num')).toEqual({ kind: 'literal', value: 3.5 });
  });

  it('expression string is expr', () => {
    const r = prepareValue('$base + 10', 'num');
    expect(r.kind).toBe('expr');
  });
});

describe('prepareValue — output type dec', () => {
  it('numeric string becomes Decimal literal', () => {
    const r = prepareValue('30000.50', 'dec');
    expect(r.kind).toBe('literal');
    if (r.kind === 'literal') {
      expect(r.value).toBeInstanceOf(Decimal);
      expect(String(r.value)).toBe('30000.5');
    }
  });

  it('bare number coerced to Decimal', () => {
    const r = prepareValue(100, 'dec');
    expect(r.kind).toBe('literal');
    if (r.kind === 'literal') expect(r.value).toBeInstanceOf(Decimal);
  });
});

describe('prepareValue — output type bool', () => {
  it('bare bool literal', () => {
    expect(prepareValue(true, 'bool')).toEqual({ kind: 'literal', value: true });
  });

  it('"true"/"false" strings parsed as bool', () => {
    expect(prepareValue('true', 'bool')).toEqual({ kind: 'literal', value: true });
  });

  it('expression', () => {
    const r = prepareValue('$x > 5', 'bool');
    expect(r.kind).toBe('expr');
  });
});

describe('prepareValue — date/time/datetime', () => {
  it('ISO date literal', () => {
    expect(prepareValue('2026-05-04', 'date')).toEqual({ kind: 'literal', value: '2026-05-04' });
  });

  it('expression for date', () => {
    const r = prepareValue('add_days(today(), 30)', 'date');
    expect(r.kind).toBe('expr');
  });
});

describe('prepareValue — error on un-parseable for non-str', () => {
  it('garbage for num throws', () => {
    expect(() => prepareValue('not a number @@@', 'num')).toThrow(ConfigError);
  });
});
