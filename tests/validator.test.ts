import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('save-time validation', () => {
  it('valid module', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x + 1' }],
    };
    const r = rf.validate(m);
    expect(r.valid).toBe(true);
  });

  it('S2 duplicate block id', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['a'],
      blocks: [
        { id: 'b1', out: ['a', 'num'], expr: '$x' },
        { id: 'b1', out: ['c', 'num'], expr: '$x' },
      ],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S2_DUPLICATE_ID')).toBe(true);
  });

  it('S3 undefined var', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$missing + 1' }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S3_UNDEFINED_VAR')).toBe(true);
  });

  it('S3 output duplicate (cross-block)', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [
        { id: 'b1', out: ['y', 'num'], expr: '$x' },
        { id: 'b2', out: ['y', 'num'], expr: '$x + 1' },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S3_OUTPUT_DUPLICATE')).toBe(true);
  });

  it('S3 shadowing', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['x'],
      blocks: [{ id: 'b1', out: ['x', 'num'], expr: '$x + 1' }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S3_SHADOWING')).toBe(true);
  });

  it('S4 cycle', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [],
      outputs: ['a'],
      blocks: [
        { id: 'b1', out: ['a', 'num'], expr: '$b' },
        { id: 'b2', out: ['b', 'num'], expr: '$a' },
      ],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S4_CYCLE')).toBe(true);
  });

  it('S7 unknown function', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: 'mystery_fn($x)' }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S7_UNKNOWN_FUNC')).toBe(true);
  });

  it('S8 module output not produced', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y', 'missing'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x' }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S8_OUTPUT_NOT_PRODUCED')).toBe(true);
  });

  it('S6 table empty', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 't1', table: ['$x'], outs: [['y', 'num', 0]], rows: [], default: {} }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S6_TABLE_EMPTY')).toBe(true);
  });

  it('S6 table row length mismatch', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'a', type: 'num' }, { name: 'b', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 't1', table: ['$a', '$b'], outs: [['y', 'num', 0]], rows: [[1, { y: 1 }]], default: {} }],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S6_TABLE_ROW_LENGTH')).toBe(true);
  });

  it('S6 duplicate row pattern', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'a', type: 'num' }],
      outputs: ['y'],
      blocks: [
        {
          id: 't1',
          table: ['$a'],
          outs: [['y', 'num', 0]],
          rows: [
            [1, { y: 10 }],
            [1, { y: 20 }],
          ],
          default: {},
        },
      ],
    };
    expect(rf.validate(m).errors.some((e) => e.code === 'S6_TABLE_DUPLICATE_ROW')).toBe(true);
  });
});

describe('runtime validation', () => {
  it('R1 missing required', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x' }],
    };
    expect(() => rf.evaluate(m, {})).toThrow(/R1_MISSING_REQUIRED/);
  });

  it('R1 enum violation', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 't', type: 'str', enum: ['a', 'b'] }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'str'], expr: '$t' }],
    };
    expect(() => rf.evaluate(m, { t: 'c' })).toThrow(/R1_OUT_OF_ENUM/);
  });

  it('R1 range violation', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'age', type: 'num', min: 0, max: 120 }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$age' }],
    };
    expect(() => rf.evaluate(m, { age: 200 })).toThrow(/R1_OUT_OF_RANGE/);
  });

  it('R1 type mismatch', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x' }],
    };
    expect(() => rf.evaluate(m, { x: 'abc' })).toThrow(/R1_TYPE_MISMATCH/);
  });
});
