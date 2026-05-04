import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js-light';
import { parseExpr } from '../src/parser.js';
import { evalExpr } from '../src/evaluator.js';
import { FunctionRegistry, loadDefaults, type ThemeName } from '../src/functions.js';

function reg(...themes: ThemeName[]) {
  const r = new FunctionRegistry();
  loadDefaults(r);
  for (const t of themes) r.loadTheme(t);
  return r;
}

const make = (...themes: ThemeName[]) => {
  const r = reg(...themes);
  return (src: string, ctx: Record<string, unknown> = {}) => evalExpr(parseExpr(src), ctx, r);
};

describe('math theme', () => {
  const e = make();
  it('abs/min/max/clamp/between', () => {
    expect(e('abs(-5)')).toBe(5);
    expect(e('min(3, 1, 7)')).toBe(1);
    expect(e('max(3, 1, 7)')).toBe(7);
    expect(e('clamp(15, 0, 10)')).toBe(10);
    expect(e('between(5, 1, 10)')).toBe(true);
  });
  it('round/ceil/floor', () => {
    expect(String(e("round(toDecimal('3.14159'), 2)"))).toBe('3.14');
    expect(String(e("ceil(toDecimal('3.1'))"))).toBe('4');
    expect(String(e("floor(toDecimal('3.9'))"))).toBe('3');
  });
  it('sqrt/pow', () => {
    expect(e('sqrt(16)')).toBe(4);
    expect(e('pow(2, 10)')).toBe(1024);
  });
  it('percent', () => {
    expect(String(e("percent(toDecimal('25'), toDecimal('200'))"))).toBe('12.5');
  });
});

describe('logic theme', () => {
  const e = make();
  it('pickIf', () => {
    expect(e('pickIf(true, 10, 20)')).toBe(10);
    expect(e('pickIf(false, 10, 20)')).toBe(20);
  });
  it('coalesce', () => {
    expect(e('coalesce($a, $b, 0)', { a: null, b: null })).toBe(0);
    expect(e('coalesce($a, $b, 0)', { a: null, b: 5 })).toBe(5);
  });
  it('inRange', () => {
    expect(e('inRange(5, 1, 10)')).toBe(true);
    expect(e('inRange(20, 1, 10)')).toBe(false);
  });
});

describe('conv theme', () => {
  const e = make();
  it('toNumber', () => {
    expect(e("toNumber('42')")).toBe(42);
    expect(e('toNumber(true)')).toBe(1);
  });
  it('toDecimal', () => {
    expect(e("toDecimal('3.14')")).toBeInstanceOf(Decimal);
  });
  it('toBool', () => {
    expect(e('toBool(1)')).toBe(true);
    expect(e('toBool(0)')).toBe(false);
    expect(e("toBool('TRUE')")).toBe(true);
  });
  it('toDate/toTime/toDateTime', () => {
    expect(e("toDate('2026-05-04')")).toBe('2026-05-04');
    expect(e("toTime('14:30:00')")).toBe('14:30:00');
    expect(e("toDateTime('2026-05-04T14:30:00Z')")).toBe('2026-05-04T14:30:00Z');
  });
});

describe('date theme', () => {
  const e = make('date');
  it('parse + format', () => {
    expect(e("parse_date('2026-05-04')")).toBe('2026-05-04');
  });
  it('add_days/months/years', () => {
    expect(e("add_days('2026-05-04', 7)")).toBe('2026-05-11');
    expect(e("add_months('2026-01-15', 3)")).toBe('2026-04-15');
    expect(e("add_years('2026-05-04', 2)")).toBe('2028-05-04');
  });
  it('days_between', () => {
    expect(e("days_between('2026-05-01', '2026-05-08')")).toBe(7);
  });
  it('weekday + is_weekend', () => {
    expect(e("weekday('2026-05-04')")).toBe(0);
    expect(e("is_weekend('2026-05-09')")).toBe(true);
    expect(e("is_weekend('2026-05-04')")).toBe(false);
  });
  it('age', () => {
    const today = new Date();
    const birth = new Date(today);
    birth.setUTCFullYear(birth.getUTCFullYear() - 30);
    const s = `${birth.getUTCFullYear()}-${String(birth.getUTCMonth() + 1).padStart(2, '0')}-${String(birth.getUTCDate()).padStart(2, '0')}`;
    expect(e(`age('${s}')`)).toBe(30);
  });
  it('hours_between', () => {
    expect(e("hours_between('2026-05-04T10:00:00Z', '2026-05-04T15:30:00Z')")).toBe(5);
  });
  it('extraction', () => {
    expect(e("year('2026-05-04')")).toBe(2026);
    expect(e("month('2026-05-04')")).toBe(5);
    expect(e("day('2026-05-04')")).toBe(4);
  });
  it('combine', () => {
    expect(e("combine('2026-05-04', '14:30:00')")).toBe('2026-05-04T14:30:00Z');
  });
  it('is_business_hours', () => {
    expect(e("is_business_hours('14:00:00', '09:00:00', '18:00:00')")).toBe(true);
    expect(e("is_business_hours('20:00:00', '09:00:00', '18:00:00')")).toBe(false);
  });
});

describe('str theme', () => {
  const e = make('str');
  it('basic', () => {
    expect(e("length('hello')")).toBe(5);
    expect(e("upper('hi')")).toBe('HI');
    expect(e("lower('HI')")).toBe('hi');
    expect(e("trim('  x  ')")).toBe('x');
    expect(e("concat('a', 'b', 'c')")).toBe('abc');
  });
  it('contains/starts/ends', () => {
    expect(e("contains('hello', 'ell')")).toBe(true);
    expect(e("starts_with('hello', 'he')")).toBe(true);
    expect(e("ends_with('hello', 'lo')")).toBe(true);
  });
  it('substring/replace', () => {
    expect(e("substring('hello', 1, 3)")).toBe('ell');
    expect(e("replace('hello', 'l', 'L')")).toBe('heLlo');
  });
});

describe('money theme', () => {
  const e = make('money');
  it('tax_amount/add_tax', () => {
    expect(String(e("tax_amount(toDecimal('1000'), 7)"))).toBe('70');
    expect(String(e("add_tax(toDecimal('1000'), 7)"))).toBe('1070');
  });
  it('currency_round', () => {
    expect(String(e("currency_round(toDecimal('3.145'))"))).toBe('3.15');
  });
  it('apply_discount', () => {
    expect(String(e("apply_discount(toDecimal('1000'), 20)"))).toBe('800');
  });
  it('percent_of', () => {
    expect(String(e("percent_of(toDecimal('25'), toDecimal('100'))"))).toBe('25');
  });
  it('compound_interest', () => {
    const r = Number(e("compound_interest(toDecimal('1000'), 5, 10, 1)"));
    expect(r).toBeCloseTo(1628.89, 1);
  });
  it('loan_payment', () => {
    const r = Number(e("loan_payment(toDecimal('1000000'), 5, 30)"));
    expect(r).toBeCloseTo(5368.22, 0);
  });
});
