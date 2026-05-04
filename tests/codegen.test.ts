import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('generateCode — formula block', () => {
  const m: Module = {
    name: 'calc',
    ver: '1.0.0',
    inputs: [{ name: 'x', type: 'num' }],
    outputs: ['y'],
    blocks: [{ id: 'b', out: ['y', 'num'], expr: '$x * 2 + 1' }],
  };

  it('emits TS function', () => {
    const code = rf.generateCode(m);
    expect(code).toContain('export function calc(inputs, fn)');
    expect(code).toContain('v.y');
    expect(code).toContain('v.x');
    expect(code).toContain('return {');
    expect(code).toContain('y: __ser(v.y),');
  });

  it('custom function name', () => {
    const code = rf.generateCode(m, { function_name: 'my_fn' });
    expect(code).toContain('export function my_fn(inputs, fn)');
  });

  it('imports decimal.js-light', () => {
    const code = rf.generateCode(m);
    expect(code).toContain("import Decimal from 'decimal.js-light';");
  });
});

describe('generateCode — if block', () => {
  const m: Module = {
    name: 'grade',
    ver: '1.0.0',
    inputs: [{ name: 'score', type: 'num' }],
    outputs: ['grade'],
    blocks: [
      {
        id: 'g',
        outs: [['grade', 'str', 'F']],
        branches: [
          ['$score >= 80', { grade: 'A' }],
          ['$score >= 70', { grade: 'B' }],
        ],
        else: {},
      },
    ],
  };

  it('emits if/else if chain', () => {
    const code = rf.generateCode(m);
    expect(code).toContain('v.score >= 80');
    expect(code).toContain('else if');
    expect(code).toContain('v.score >= 70');
    expect(code).toContain('v.grade = "F"');
    expect(code).toContain('"A"');
    expect(code).toContain('"B"');
  });
});

describe('generateCode — switch block', () => {
  const m: Module = {
    name: 'tier_disc',
    ver: '1.0.0',
    inputs: [{ name: 'tier', type: 'str' }],
    outputs: ['discount'],
    blocks: [
      {
        id: 't',
        on: '$tier',
        outs: [['discount', 'num', 0]],
        cases: [
          ['gold', { discount: 15 }],
          ['silver', { discount: 10 }],
        ],
        default: {},
      },
    ],
  };

  it('emits switch/case', () => {
    const code = rf.generateCode(m);
    expect(code).toContain('switch (v.tier)');
    expect(code).toContain('case "gold"');
    expect(code).toContain('case "silver"');
    expect(code).toContain('15');
    expect(code).toContain('10');
  });
});

describe('generateCode — table block', () => {
  const m: Module = {
    name: 'tab',
    ver: '1.0.0',
    inputs: [
      { name: 'tier', type: 'str' },
      { name: 'qty', type: 'num' },
    ],
    outputs: ['discount'],
    blocks: [
      {
        id: 't',
        table: ['$tier', '$qty'],
        outs: [['discount', 'num', 0]],
        rows: [
          ['gold', '>=100', { discount: 25 }],
          ['gold', '*', { discount: 15 }],
          ['*', '5..50', { discount: 10 }],
        ],
        default: {},
      },
    ],
  };

  it('emits if-chain for rows', () => {
    const code = rf.generateCode(m);
    expect(code).toContain('v.tier === "gold"');
    expect(code).toContain('Number(v.qty) >= 100');
    expect(code).toContain('Number(v.qty) >= 5 && Number(v.qty) <= 50');
    expect(code).toContain('25');
  });
});

describe('generateCode — function call uses fn map', () => {
  const m: Module = {
    name: 'calc_fn',
    ver: '1.0.0',
    inputs: [{ name: 'x', type: 'num' }],
    outputs: ['y'],
    blocks: [{ id: 'b', out: ['y', 'num'], expr: 'min($x, 100)' }],
  };

  it('compiles function call to fn.X', () => {
    const code = rf.generateCode(m);
    expect(code).toContain('fn.min(v.x, 100)');
  });
});
