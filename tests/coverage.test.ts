import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('S11 coverage check', () => {
  it('skipped when no constraints', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str' }],
      outputs: ['d'],
      blocks: [
        {
          id: 't',
          table: ['$tier'],
          outs: [['d', 'num', 0]],
          rows: [['gold', { d: 10 }]],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.warnings.some((w) => w.code === 'S11_NO_COVERAGE')).toBe(true);
  });

  it('coverage gap warned (default fallback)', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [
        { name: 'tier', type: 'str', enum: ['gold', 'silver', 'bronze'] },
        { name: 'flag', type: 'bool' },
      ],
      outputs: ['d'],
      blocks: [
        {
          id: 't',
          table: ['$tier', '$flag'],
          outs: [['d', 'num', 0]],
          rows: [['gold', true, { d: 100 }]],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.warnings.some((w) => w.code === 'S11_COVERAGE_GAP')).toBe(true);
  });

  it('full coverage = no gap warning', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str', enum: ['gold', 'silver'] }],
      outputs: ['d'],
      blocks: [
        {
          id: 't',
          table: ['$tier'],
          outs: [['d', 'num', 0]],
          rows: [
            ['gold', { d: 10 }],
            ['silver', { d: 5 }],
          ],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.warnings.some((w) => w.code === 'S11_COVERAGE_GAP')).toBe(false);
  });

  it('dead row detected', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'tier', type: 'str', enum: ['gold', 'silver'] }],
      outputs: ['d'],
      blocks: [
        {
          id: 't',
          table: ['$tier'],
          outs: [['d', 'num', 0]],
          rows: [
            ['*', { d: 5 }],
            ['gold', { d: 10 }],
          ],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.warnings.some((w) => w.code === 'S11_DEAD_ROW')).toBe(true);
  });

  it('skipped when too large', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [
        { name: 'a', type: 'num', min: 1, max: 100 },
        { name: 'b', type: 'num', min: 1, max: 100 },
        { name: 'c', type: 'num', min: 1, max: 100 },
      ],
      outputs: ['d'],
      blocks: [
        {
          id: 't',
          table: ['$a', '$b', '$c'],
          outs: [['d', 'num', 0]],
          rows: [[1, 1, 1, { d: 1 }]],
          default: {},
        },
      ],
    };
    const r = rf.validate(m);
    expect(r.warnings.some((w) => w.code === 'S11_COVERAGE_TOO_LARGE')).toBe(true);
  });
});
