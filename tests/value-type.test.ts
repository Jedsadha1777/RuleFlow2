import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('S5_VALUE_TYPE: set value vs declared output type', () => {
  it('flags string assigned to num branch set', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['result'],
      blocks: [
        {
          id: 'if1',
          outs: [['result', 'num', 0]],
          branches: [['$x > 1', { result: 'adult' }]],
          else: { result: 0 },
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(true);
  });

  it('flags string fallback for num output', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['result'],
      blocks: [
        {
          id: 'if1',
          outs: [['result', 'num', 'child']],
          branches: [['$x > 1', { result: 1 }]],
          else: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(true);
  });

  it('allows $var reference for num output', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['result'],
      blocks: [
        {
          id: 'if1',
          outs: [['result', 'num', 0]],
          branches: [['$x > 1', { result: '$x' }]],
          else: { result: 0 },
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(false);
  });

  it('allows string to str output', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['result'],
      blocks: [
        {
          id: 'if1',
          outs: [['result', 'str', 'child']],
          branches: [['$x > 1', { result: 'adult' }]],
          else: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(false);
  });

  it('flags string in switch case', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 't', type: 'str' }],
      outputs: ['n'],
      blocks: [
        {
          id: 's1',
          on: '$t',
          outs: [['n', 'num', 0]],
          cases: [['a', { n: 'oops' }]],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(true);
  });

  it('flags string in table row', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['n'],
      blocks: [
        {
          id: 't1',
          table: ['$x'],
          outs: [['n', 'num', 0]],
          rows: [[1, { n: 'bad' }]],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_VALUE_TYPE')).toBe(true);
  });
});
