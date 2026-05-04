import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('FormulaBlock', () => {
  it('simple math', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x * 2' }],
    };
    expect(rf.evaluate(m, { x: 5 })).toEqual({ y: 10 });
  });

  it('decimal preserves precision', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'p', type: 'dec' }, { name: 'q', type: 'num' }],
      outputs: ['t'],
      blocks: [{ id: 'b1', out: ['t', 'dec'], expr: '$p * $q' }],
    };
    expect(rf.evaluate(m, { p: '99.99', q: 3 })).toEqual({ t: '299.97' });
  });

  it('chain via $ref', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'a', type: 'num' }],
      outputs: ['c'],
      blocks: [
        { id: 'b1', out: ['b', 'num'], expr: '$a * 2' },
        { id: 'b2', out: ['c', 'num'], expr: '$b + 1' },
      ],
    };
    expect(rf.evaluate(m, { a: 5 })).toEqual({ c: 11 });
  });
});

describe('IfBlock', () => {
  it('first-match wins', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'score', type: 'num' }],
      outputs: ['grade'],
      blocks: [
        {
          id: 'b1',
          outs: [['grade', 'str', 'F']],
          branches: [
            ['$score >= 80', { grade: 'A' }],
            ['$score >= 70', { grade: 'B' }],
            ['$score >= 60', { grade: 'C' }],
          ],
          else: {},
        },
      ],
    };
    expect(rf.evaluate(m, { score: 85 })).toEqual({ grade: 'A' });
    expect(rf.evaluate(m, { score: 75 })).toEqual({ grade: 'B' });
    expect(rf.evaluate(m, { score: 50 })).toEqual({ grade: 'F' });
  });

  it('multi-output with fallback', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str' }],
      outputs: ['discount', 'level'],
      blocks: [
        {
          id: 'b1',
          outs: [
            ['discount', 'num', 0],
            ['level', 'str', 'basic'],
          ],
          branches: [
            ["$tier == 'gold'", { discount: 20, level: 'premium' }],
            ["$tier == 'silver'", { discount: 10, level: 'mid' }],
          ],
          else: {},
        },
      ],
    };
    expect(rf.evaluate(m, { tier: 'gold' })).toEqual({ discount: 20, level: 'premium' });
    expect(rf.evaluate(m, { tier: 'bronze' })).toEqual({ discount: 0, level: 'basic' });
  });

  it('partial set uses fallback', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'flag', type: 'bool' }],
      outputs: ['a', 'b'],
      blocks: [
        {
          id: 'b1',
          outs: [
            ['a', 'num', 0],
            ['b', 'num', 99],
          ],
          branches: [['$flag', { a: 5 }]],
          else: {},
        },
      ],
    };
    expect(rf.evaluate(m, { flag: true })).toEqual({ a: 5, b: 99 });
  });
});

describe('SwitchBlock', () => {
  it('case match + default', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str' }],
      outputs: ['discount'],
      blocks: [
        {
          id: 'b1',
          on: '$tier',
          outs: [['discount', 'num', 0]],
          cases: [
            ['gold', { discount: 15 }],
            ['silver', { discount: 10 }],
            ['bronze', { discount: 5 }],
          ],
          default: {},
        },
      ],
    };
    expect(rf.evaluate(m, { tier: 'gold' })).toEqual({ discount: 15 });
    expect(rf.evaluate(m, { tier: 'unknown' })).toEqual({ discount: 0 });
  });
});

describe('TableBlock', () => {
  const tab: Module = {
    name: 'tab',
    ver: '1.0.0',
    inputs: [
      { name: 'tier', type: 'str' },
      { name: 'region', type: 'str' },
      { name: 'qty', type: 'num' },
    ],
    outputs: ['discount'],
    blocks: [
      {
        id: 't1',
        table: ['$tier', '$region', '$qty'],
        outs: [['discount', 'num', 0]],
        rows: [
          ['gold', 'asia', '>=100', { discount: 25 }],
          ['gold', 'asia', '*', { discount: 20 }],
          ['gold', '*', '*', { discount: 15 }],
          ['silver', '*', '10..50', { discount: 8 }],
          ['*', '*', '*', { discount: 2 }],
        ],
        default: {},
      },
    ],
  };

  it('exact + range + wildcard', () => {
    expect(rf.evaluate(tab, { tier: 'gold', region: 'asia', qty: 200 })).toEqual({ discount: 25 });
    expect(rf.evaluate(tab, { tier: 'gold', region: 'asia', qty: 50 })).toEqual({ discount: 20 });
    expect(rf.evaluate(tab, { tier: 'gold', region: 'eu', qty: 1 })).toEqual({ discount: 15 });
    expect(rf.evaluate(tab, { tier: 'silver', region: 'eu', qty: 30 })).toEqual({ discount: 8 });
    expect(rf.evaluate(tab, { tier: 'bronze', region: 'eu', qty: 1 })).toEqual({ discount: 2 });
  });

  it('first-match-wins (specific before general)', () => {
    expect(rf.evaluate(tab, { tier: 'gold', region: 'asia', qty: 150 })).toEqual({ discount: 25 });
  });
});

describe('Nested blocks', () => {
  it('if branch with nested switch', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [
        { name: 'score', type: 'num' },
        { name: 'tier', type: 'str' },
      ],
      outputs: ['decision', 'amount'],
      blocks: [
        {
          id: 'main',
          outs: [
            ['decision', 'str', 'rejected'],
            ['amount', 'num', 0],
          ],
          branches: [
            ['$score >= 100', { decision: 'approved', amount: 1000 }],
            [
              '$score >= 70',
              [
                {
                  id: 'tier_amount',
                  on: '$tier',
                  outs: [['amount', 'num', 100]],
                  cases: [
                    ['gold', { amount: 800 }],
                    ['silver', { amount: 500 }],
                  ],
                  default: {},
                },
                { id: 'set_dec', out: ['decision', 'str'], expr: "'review'" },
              ],
            ],
          ],
          else: {},
        },
      ],
    };
    expect(rf.evaluate(m, { score: 80, tier: 'gold' })).toEqual({ decision: 'review', amount: 800 });
    expect(rf.evaluate(m, { score: 80, tier: 'unknown' })).toEqual({ decision: 'review', amount: 100 });
    expect(rf.evaluate(m, { score: 100, tier: 'gold' })).toEqual({ decision: 'approved', amount: 1000 });
    expect(rf.evaluate(m, { score: 50, tier: 'gold' })).toEqual({ decision: 'rejected', amount: 0 });
  });
});
