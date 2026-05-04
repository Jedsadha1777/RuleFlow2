import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('demo10 — Employee Bonus Matrix (Performance × Tenure)', () => {
  const bonus: Module = {
    name: 'employee_bonus',
    ver: '1.0.0',
    uses: ['money'],
    inputs: [
      { name: 'performance_rating', type: 'num', min: 0, max: 100 },
      { name: 'years_tenure', type: 'num', min: 0, max: 50 },
      { name: 'base_salary', type: 'dec' },
    ],
    outputs: ['bonus_percentage', 'bonus_level', 'bonus_amount'],
    blocks: [
      {
        id: 'bonus_table',
        table: ['$performance_rating', '$years_tenure'],
        outs: [
          ['bonus_percentage', 'num', 0],
          ['bonus_level', 'str', 'Standard'],
        ],
        rows: [
          ['>=90', '>=5', { bonus_percentage: 20, bonus_level: 'Top Performer' }],
          ['>=90', '>=2', { bonus_percentage: 15, bonus_level: 'High Achiever' }],
          ['>=90', '*', { bonus_percentage: 12, bonus_level: 'Rising Star' }],
          ['75..89', '>=5', { bonus_percentage: 12, bonus_level: 'Solid Contributor' }],
          ['75..89', '>=2', { bonus_percentage: 8, bonus_level: 'Good Employee' }],
          ['75..89', '*', { bonus_percentage: 6, bonus_level: 'Developing' }],
          ['60..74', '>=5', { bonus_percentage: 6, bonus_level: 'Experienced' }],
          ['60..74', '>=2', { bonus_percentage: 4, bonus_level: 'Standard' }],
          ['60..74', '*', { bonus_percentage: 2, bonus_level: 'Basic' }],
        ],
        default: {},
      },
      { id: 'amount', out: ['bonus_amount', 'dec'], expr: 'currency_round($base_salary * $bonus_percentage / 100)' },
    ],
  };

  it('Sarah (Star) — 95, 6 yrs, 85000', () => {
    const r = rf.evaluate(bonus, { performance_rating: 95, years_tenure: 6, base_salary: '85000' });
    expect(r.bonus_percentage).toBe(20);
    expect(r.bonus_level).toBe('Top Performer');
    expect(r.bonus_amount).toBe('17000');
  });

  it('Mike (Solid) — 82, 4 yrs, 70000', () => {
    const r = rf.evaluate(bonus, { performance_rating: 82, years_tenure: 4, base_salary: '70000' });
    expect(r.bonus_percentage).toBe(8);
    expect(r.bonus_level).toBe('Good Employee');
    expect(r.bonus_amount).toBe('5600');
  });

  it('Lisa (New) — 88, 1.5 yrs, 65000', () => {
    const r = rf.evaluate(bonus, { performance_rating: 88, years_tenure: 1.5, base_salary: '65000' });
    expect(r.bonus_level).toBe('Developing');
    expect(r.bonus_amount).toBe('3900');
  });

  it('Tom (Veteran) — 72, 8 yrs, 75000', () => {
    const r = rf.evaluate(bonus, { performance_rating: 72, years_tenure: 8, base_salary: '75000' });
    expect(r.bonus_level).toBe('Experienced');
    expect(r.bonus_amount).toBe('4500');
  });
});

describe('demo10 — Credit Card Limit Matrix (Income × Credit Score)', () => {
  const credit: Module = {
    name: 'credit_limit',
    ver: '1.0.0',
    inputs: [
      { name: 'credit_score', type: 'num', min: 300, max: 850 },
      { name: 'monthly_income', type: 'dec' },
    ],
    outputs: ['credit_limit', 'tier', 'annual_fee'],
    blocks: [
      {
        id: 'limit_table',
        table: ['$credit_score', '$monthly_income'],
        outs: [
          ['credit_limit', 'dec', '0'],
          ['tier', 'str', 'Declined'],
        ],
        rows: [
          ['>=750', '>=8000', { credit_limit: '25000', tier: 'Platinum' }],
          ['>=750', '>=5000', { credit_limit: '15000', tier: 'Gold' }],
          ['>=750', '>=3000', { credit_limit: '10000', tier: 'Silver' }],
          ['650..749', '>=6000', { credit_limit: '15000', tier: 'Gold' }],
          ['650..749', '>=4000', { credit_limit: '8000', tier: 'Silver' }],
          ['650..749', '>=2500', { credit_limit: '5000', tier: 'Bronze' }],
          ['600..649', '>=5000', { credit_limit: '8000', tier: 'Silver' }],
          ['600..649', '>=3000', { credit_limit: '3000', tier: 'Bronze' }],
          ['600..649', '>=2000', { credit_limit: '1500', tier: 'Starter' }],
        ],
        default: {},
      },
      {
        id: 'fee',
        on: '$tier',
        outs: [['annual_fee', 'num', 0]],
        cases: [
          ['Platinum', { annual_fee: 500 }],
          ['Gold', { annual_fee: 200 }],
          ['Silver', { annual_fee: 100 }],
        ],
        default: {},
      },
    ],
  };

  it('Executive — 780, 12000', () => {
    const r = rf.evaluate(credit, { credit_score: 780, monthly_income: '12000' });
    expect(r.tier).toBe('Platinum');
    expect(r.credit_limit).toBe('25000');
    expect(r.annual_fee).toBe(500);
  });

  it('Manager — 720, 6500', () => {
    const r = rf.evaluate(credit, { credit_score: 720, monthly_income: '6500' });
    expect(r.tier).toBe('Gold');
    expect(r.credit_limit).toBe('15000');
  });

  it('Worker — 620, 3200', () => {
    const r = rf.evaluate(credit, { credit_score: 620, monthly_income: '3200' });
    expect(r.tier).toBe('Bronze');
    expect(r.credit_limit).toBe('3000');
    expect(r.annual_fee).toBe(0);
  });

  it('Below threshold → Declined', () => {
    const r = rf.evaluate(credit, { credit_score: 550, monthly_income: '1500' });
    expect(r.tier).toBe('Declined');
    expect(r.credit_limit).toBe('0');
  });
});
