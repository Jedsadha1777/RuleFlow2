import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const m: Module = {
  name: 'debug_demo',
  ver: '1.0.0',
  inputs: [{ name: 'x', type: 'num' }],
  outputs: ['c'],
  blocks: [
    { id: 'a', out: ['a', 'num'], expr: '$x * 2' },
    { id: 'b', out: ['b', 'num'], expr: '$a + 1' },
    {
      id: 'c',
      outs: [['c', 'str', 'small']],
      branches: [
        ['$b >= 100', { c: 'big' }],
        ['$b >= 50', { c: 'medium' }],
      ],
      else: {},
    },
  ],
};

describe('debug() — execution trace', () => {
  it('returns result + trace', () => {
    const r = rf.debug(m, { x: 30 });
    expect(r.result).toEqual({ c: 'medium' });
    expect(r.trace.order).toEqual(['a', 'b', 'c']);
  });

  it('captures intermediate state per block', () => {
    const r = rf.debug(m, { x: 30 });
    expect(r.trace.intermediate.a.before).toEqual({ x: 30 });
    expect(r.trace.intermediate.a.after).toEqual({ x: 30, a: 60 });
    expect(r.trace.intermediate.a.delta).toEqual({ a: 60 });
    expect(r.trace.intermediate.b.delta).toEqual({ b: 61 });
    expect(r.trace.intermediate.c.delta).toEqual({ c: 'medium' });
  });

  it('captures block kind', () => {
    const r = rf.debug(m, { x: 30 });
    expect(r.trace.intermediate.a.block_kind).toBe('formula');
    expect(r.trace.intermediate.c.block_kind).toBe('if');
  });

  it('captures timing per block', () => {
    const r = rf.debug(m, { x: 1 });
    for (const id of r.trace.order) {
      expect(r.trace.timing_us[id]).toBeGreaterThanOrEqual(0);
    }
    expect(r.trace.total_us).toBeGreaterThanOrEqual(0);
  });

  it('error attaches block id', () => {
    const bad: Module = {
      name: 'b',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'div', out: ['y', 'num'], expr: '$x / 0' }],
    };
    expect(() => rf.debug(bad, { x: 5 })).toThrow(/R2_DIVIDE_BY_ZERO/);
  });
});
