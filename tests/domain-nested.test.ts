import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('demo15 — Nested Logic (loan with collateral compensation)', () => {
  const loan: Module = {
    name: 'loan_with_collateral',
    ver: '1.0.0',
    inputs: [
      { name: 'age', type: 'num' },
      { name: 'income', type: 'dec' },
      { name: 'has_collateral', type: 'bool' },
      { name: 'status', type: 'str' },
    ],
    outputs: ['decision'],
    blocks: [
      {
        id: 'd',
        outs: [['decision', 'str', 'rejected']],
        branches: [
          [
            "$age > 25 AND ($income > 30000 OR $has_collateral) AND $status != 'blacklist'",
            { decision: 'approved' },
          ],
        ],
        else: {},
      },
    ],
  };

  it('low income but has collateral → approved', () => {
    const r = rf.evaluate(loan, { age: 30, income: '25000', has_collateral: true, status: 'normal' });
    expect(r.decision).toBe('approved');
  });

  it('high income, no collateral → approved', () => {
    const r = rf.evaluate(loan, { age: 30, income: '50000', has_collateral: false, status: 'normal' });
    expect(r.decision).toBe('approved');
  });

  it('blacklist → rejected even if other criteria pass', () => {
    const r = rf.evaluate(loan, { age: 30, income: '50000', has_collateral: true, status: 'blacklist' });
    expect(r.decision).toBe('rejected');
  });

  it('young (≤25) → rejected', () => {
    const r = rf.evaluate(loan, { age: 22, income: '50000', has_collateral: true, status: 'normal' });
    expect(r.decision).toBe('rejected');
  });

  it('low income, no collateral → rejected', () => {
    const r = rf.evaluate(loan, { age: 40, income: '20000', has_collateral: false, status: 'normal' });
    expect(r.decision).toBe('rejected');
  });
});

describe('demo15 — Nested if branch with sub-blocks', () => {
  const m: Module = {
    name: 'tier_decision',
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

  it('gold tier review', () => {
    expect(rf.evaluate(m, { score: 80, tier: 'gold' })).toEqual({ decision: 'review', amount: 800 });
  });

  it('unknown tier → fallback amount in nested switch', () => {
    expect(rf.evaluate(m, { score: 80, tier: 'unknown' })).toEqual({ decision: 'review', amount: 100 });
  });

  it('approved short-circuits before nested', () => {
    expect(rf.evaluate(m, { score: 100, tier: 'gold' })).toEqual({ decision: 'approved', amount: 1000 });
  });
});
