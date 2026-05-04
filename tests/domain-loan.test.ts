import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const loan: Module = {
  name: 'loan_application',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'annual_income', type: 'dec' },
    { name: 'monthly_debt', type: 'dec' },
    { name: 'credit_score', type: 'num' },
    { name: 'employment_years', type: 'num' },
  ],
  outputs: [
    'monthly_income',
    'dti_ratio',
    'credit_points',
    'income_points',
    'employment_points',
    'total_score',
    'decision',
    'interest_rate',
    'max_amount',
    'monthly_payment',
  ],
  blocks: [
    { id: 'monthly_income', out: ['monthly_income', 'dec'], expr: '$annual_income / 12' },
    { id: 'dti', out: ['dti_ratio', 'dec'], expr: 'percent_of($monthly_debt, $monthly_income)' },
    {
      id: 'credit_points',
      outs: [['credit_points', 'num', 0]],
      branches: [
        ['$credit_score >= 750', { credit_points: 100 }],
        ['$credit_score >= 700', { credit_points: 80 }],
        ['$credit_score >= 650', { credit_points: 60 }],
        ['$credit_score >= 600', { credit_points: 40 }],
        ['$credit_score >= 550', { credit_points: 20 }],
      ],
      else: {},
    },
    {
      id: 'income_points',
      outs: [['income_points', 'num', 0]],
      branches: [
        ['$monthly_income >= 10000', { income_points: 50 }],
        ['$monthly_income >= 7500', { income_points: 40 }],
        ['$monthly_income >= 5000', { income_points: 30 }],
        ['$monthly_income >= 3000', { income_points: 20 }],
        ['$monthly_income >= 2000', { income_points: 10 }],
      ],
      else: {},
    },
    {
      id: 'employment_points',
      outs: [['employment_points', 'num', 0]],
      branches: [
        ['$employment_years >= 5', { employment_points: 30 }],
        ['$employment_years >= 3', { employment_points: 20 }],
        ['$employment_years >= 1', { employment_points: 10 }],
        ['$employment_years >= 0.5', { employment_points: 5 }],
      ],
      else: {},
    },
    {
      id: 'total',
      out: ['total_score', 'num'],
      expr: '$credit_points + $income_points + $employment_points',
    },
    {
      id: 'decision',
      outs: [
        ['decision', 'str', 'Rejected'],
        ['interest_rate', 'dec', '0'],
        ['max_amount', 'dec', '0'],
      ],
      branches: [
        ['$total_score >= 150', { decision: 'Approved', interest_rate: '3.5', max_amount: '1000000' }],
        ['$total_score >= 120', { decision: 'Approved', interest_rate: '4.5', max_amount: '500000' }],
        ['$total_score >= 80', { decision: 'Conditional', interest_rate: '6.5', max_amount: '200000' }],
      ],
      else: {},
    },
    {
      id: 'monthly_payment',
      out: ['monthly_payment', 'dec'],
      expr: 'currency_round(loan_payment($max_amount, $interest_rate, 30))',
    },
  ],
};

describe('demo4 — Loan Application Assessment', () => {
  it('Excellent: income 120k, debt 1.5k, credit 780, 8 yrs', () => {
    const r = rf.evaluate(loan, {
      annual_income: '120000',
      monthly_debt: '1500',
      credit_score: 780,
      employment_years: 8,
    });
    expect(r.monthly_income).toBe('10000');
    expect(r.dti_ratio).toBe('15');
    expect(r.credit_points).toBe(100);
    expect(r.income_points).toBe(50);
    expect(r.employment_points).toBe(30);
    expect(r.total_score).toBe(180);
    expect(r.decision).toBe('Approved');
    expect(r.interest_rate).toBe('3.5');
    expect(r.max_amount).toBe('1000000');
  });

  it('Marginal: income 45k, debt 1.8k, credit 650, 2 yrs', () => {
    const r = rf.evaluate(loan, {
      annual_income: '45000',
      monthly_debt: '1800',
      credit_score: 650,
      employment_years: 2,
    });
    expect(r.credit_points).toBe(60);
    expect(r.income_points).toBe(20);
    expect(r.employment_points).toBe(10);
    expect(r.total_score).toBe(90);
    expect(r.decision).toBe('Conditional');
  });

  it('Poor credit: income 35k, debt 2.2k, credit 580, 0.5 yr → Rejected', () => {
    const r = rf.evaluate(loan, {
      annual_income: '35000',
      monthly_debt: '2200',
      credit_score: 580,
      employment_years: 0.5,
    });
    expect(r.total_score).toBe(35);
    expect(r.decision).toBe('Rejected');
  });

  it('Batch: 3 applications', () => {
    const batch = rf.evaluateBatch(loan, [
      { annual_income: '80000', monthly_debt: '1200', credit_score: 720, employment_years: 5 },
      { annual_income: '55000', monthly_debt: '1800', credit_score: 680, employment_years: 3 },
      { annual_income: '95000', monthly_debt: '900', credit_score: 750, employment_years: 7 },
    ]);
    expect(batch.every((r) => r.success)).toBe(true);
    expect(batch[0].result?.decision).toBe('Approved');
    expect(batch[1].result?.decision).toBe('Conditional');
    expect(batch[2].result?.decision).toBe('Approved');
  });
});
