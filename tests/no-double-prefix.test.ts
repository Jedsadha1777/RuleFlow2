import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

describe('error message has no double prefix', () => {
  const rf = new RuleFlow();

  it('validate result error.message has no code prefix', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x +' }],
    };
    const r = rf.validate(m);
    const e = r.errors.find((x) => x.code === 'S5_EXPR_PARSE');
    expect(e).toBeDefined();
    expect(e!.message).not.toMatch(/^S5_EXPR_PARSE/);
  });

  it('prepare() throws with single prefix', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x +' }],
    };
    let msg = '';
    try {
      rf.prepare(m);
    } catch (e) {
      msg = (e as Error).message;
    }
    expect(msg.match(/S5_EXPR_PARSE/g)?.length).toBe(1);
  });

  it('tryParseExpr error.message has no code prefix', () => {
    const r = rf.tryParseExpr('$x +');
    expect(r.error).toBeDefined();
    expect(r.error!.message).not.toMatch(/^S5_EXPR_PARSE/);
  });

  it('empty expr produces S5_EXPR_EMPTY (not parse error)', () => {
    const m: Module = {
      name: 'm',
      ver: '1',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: '' }],
    };
    const r = rf.validate(m);
    expect(r.errors.some((e) => e.code === 'S5_EXPR_EMPTY')).toBe(true);
    expect(r.errors.some((e) => e.code === 'S5_EXPR_PARSE')).toBe(false);
  });
});
