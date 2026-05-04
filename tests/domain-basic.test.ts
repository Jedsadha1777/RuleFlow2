import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('demo1 — Basic formula chains', () => {
  const calc: Module = {
    name: 'order_calc',
    ver: '1.0.0',
    uses: ['money'],
    inputs: [
      { name: 'price', type: 'dec' },
      { name: 'quantity', type: 'num' },
      { name: 'tax_rate', type: 'num' },
    ],
    outputs: ['subtotal', 'tax', 'total'],
    blocks: [
      { id: 'sub', out: ['subtotal', 'dec'], expr: '$price * $quantity' },
      { id: 'tx', out: ['tax', 'dec'], expr: '$subtotal * $tax_rate / 100' },
      { id: 'tot', out: ['total', 'dec'], expr: 'currency_round($subtotal + $tax)' },
    ],
  };

  it('order subtotal + tax + total', () => {
    const r = rf.evaluate(calc, { price: '100', quantity: 3, tax_rate: 7 });
    expect(r.subtotal).toBe('300');
    expect(r.tax).toBe('21');
    expect(r.total).toBe('321');
  });

  it('with discount in formula', () => {
    const r = rf.evaluate(calc, { price: '99.99', quantity: 5, tax_rate: 10 });
    expect(r.subtotal).toBe('499.95');
    expect(r.total).toBe('549.95');
  });
});

describe('demo8 — $ notation cross-formula references', () => {
  const m: Module = {
    name: 'cross_ref',
    ver: '1.0.0',
    inputs: [{ name: 'a', type: 'num' }],
    outputs: ['b', 'c', 'd', 'e'],
    blocks: [
      { id: 'b1', out: ['b', 'num'], expr: '$a + 1' },
      { id: 'b2', out: ['c', 'num'], expr: '$b * 2' },
      { id: 'b3', out: ['d', 'num'], expr: '$b + $c' },
      { id: 'b4', out: ['e', 'num'], expr: '$a + $b + $c + $d' },
    ],
  };

  it('chained $ refs resolve in topological order', () => {
    const r = rf.evaluate(m, { a: 10 });
    // b = 11, c = 22, d = 33, e = 10+11+22+33 = 76
    expect(r.b).toBe(11);
    expect(r.c).toBe(22);
    expect(r.d).toBe(33);
    expect(r.e).toBe(76);
  });

  it('topo sort handles out-of-order definitions', () => {
    const reversed: Module = {
      name: 'rev',
      ver: '1.0.0',
      inputs: [{ name: 'a', type: 'num' }],
      outputs: ['c'],
      blocks: [
        { id: 'final', out: ['c', 'num'], expr: '$b * 2' },
        { id: 'first', out: ['b', 'num'], expr: '$a + 1' },
      ],
    };
    expect(rf.evaluate(reversed, { a: 5 })).toEqual({ c: 12 });
  });
});

describe('demo9 — Custom function pack', () => {
  it('register pack and use functions', () => {
    const local = new RuleFlow();
    local.addPack(
      {
        name: 'thai_locale',
        ver: '1.0.0',
        funcs: [
          {
            name: 'thai_vat',
            theme: 'thai',
            args: [{ name: 'amount', type: 'dec' }],
            return: 'dec',
          },
          {
            name: 'is_thai_holiday',
            theme: 'thai',
            args: [{ name: 'date', type: 'date' }],
            return: 'bool',
          },
        ],
      },
      {
        thai_vat: (amount: unknown) => {
          const n = Number(amount);
          return n * 0.07;
        },
        is_thai_holiday: (d: unknown) => {
          const holidays = ['2026-04-13', '2026-04-14', '2026-04-15', '2026-12-31'];
          return holidays.includes(String(d));
        },
      },
    );

    const m: Module = {
      name: 'thai_invoice',
      ver: '1.0.0',
      inputs: [{ name: 'amount', type: 'dec' }],
      outputs: ['vat'],
      blocks: [{ id: 'v', out: ['vat', 'dec'], expr: 'thai_vat($amount)' }],
    };
    expect(local.evaluate(m, { amount: '1000' })).toEqual({ vat: '70' });
  });

  it('pack function used in if condition', () => {
    const local = new RuleFlow();
    local.addPack(
      {
        name: 'biz',
        ver: '1.0.0',
        funcs: [
          {
            name: 'is_premium',
            theme: 'biz',
            args: [{ name: 'tier', type: 'str' }],
            return: 'bool',
          },
        ],
      },
      {
        is_premium: (tier: unknown) => tier === 'gold' || tier === 'platinum',
      },
    );

    const m: Module = {
      name: 'discount',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str' }],
      outputs: ['discount'],
      blocks: [
        {
          id: 'd',
          outs: [['discount', 'num', 0]],
          branches: [['is_premium($tier)', { discount: 20 }]],
          else: {},
        },
      ],
    };
    expect(local.evaluate(m, { tier: 'gold' })).toEqual({ discount: 20 });
    expect(local.evaluate(m, { tier: 'silver' })).toEqual({ discount: 0 });
  });
});
