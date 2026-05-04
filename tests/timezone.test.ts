import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';
import { parseDateTime } from '../src/util.js';

const rf = new RuleFlow();
rf.loadTheme('date');

describe('parseDateTime captures tzOffsetMin', () => {
  it('Z = 0', () => {
    expect(parseDateTime('2026-05-04T14:30:00Z')?.tzOffsetMin).toBe(0);
  });
  it('+07:00 = 420', () => {
    expect(parseDateTime('2026-05-04T14:30:00+07:00')?.tzOffsetMin).toBe(420);
  });
  it('-05:00 = -300', () => {
    expect(parseDateTime('2026-05-04T14:30:00-05:00')?.tzOffsetMin).toBe(-300);
  });
  it('no TZ defaults to 0', () => {
    expect(parseDateTime('2026-05-04T14:30:00')?.tzOffsetMin).toBe(0);
  });
});

describe('engine arithmetic honors TZ offset (the fix)', () => {
  const m: Module = {
    name: 'm',
    ver: '1',
    uses: ['date'],
    inputs: [
      { name: 'a', type: 'datetime' },
      { name: 'b', type: 'datetime' },
    ],
    outputs: ['gap'],
    blocks: [{ id: 'g', out: ['gap', 'num'], expr: 'hours_between($a, $b)' }],
  };

  it('14:30+07:00 vs 14:30Z is a 7-hour gap (was 0 before fix)', () => {
    const r = rf.evaluate(m, {
      a: '2026-05-04T14:30:00+07:00',
      b: '2026-05-04T14:30:00Z',
    });
    expect(r.gap).toBe(7);
  });

  it('same instant in different TZ has 0 gap', () => {
    // 14:30 +07:00 == 07:30 Z (same wall clock moment in UTC)
    const r = rf.evaluate(m, {
      a: '2026-05-04T14:30:00+07:00',
      b: '2026-05-04T07:30:00Z',
    });
    expect(r.gap).toBe(0);
  });

  it('add_hours respects original TZ in math, output normalizes to UTC Z', () => {
    const m2: Module = {
      name: 'm',
      ver: '1',
      uses: ['date'],
      inputs: [{ name: 'dt', type: 'datetime' }],
      outputs: ['plus2'],
      blocks: [{ id: 'a', out: ['plus2', 'datetime'], expr: 'add_hours($dt, 2)' }],
    };
    // 14:30 Bangkok = 07:30 UTC; +2h = 09:30 UTC
    expect(rf.evaluate(m2, { dt: '2026-05-04T14:30:00+07:00' }).plus2)
      .toBe('2026-05-04T09:30:00Z');
  });
});

describe('extraction functions read parts as-written (NOT converted to UTC)', () => {
  it('hour() of 14:30+07:00 returns 14 (wall clock), not 7 (UTC)', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      uses: ['date'],
      inputs: [{ name: 'dt', type: 'datetime' }],
      outputs: ['h'],
      blocks: [{ id: 'b', out: ['h', 'num'], expr: 'hour($dt)' }],
    };
    expect(rf.evaluate(m, { dt: '2026-05-04T14:30:00+07:00' }).h).toBe(14);
  });
});
