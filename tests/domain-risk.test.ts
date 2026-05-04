import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const risk: Module = {
  name: 'fraud_risk_scoring',
  ver: '1.0.0',
  inputs: [
    { name: 'age', type: 'num' },
    { name: 'transaction_amount', type: 'dec' },
    { name: 'country_risk', type: 'str' },
    { name: 'time_of_day', type: 'num', min: 0, max: 23 },
    { name: 'transactions_24h', type: 'num' },
  ],
  outputs: ['age_risk', 'amount_risk', 'country_risk_score', 'time_risk', 'velocity_risk', 'total_risk', 'action'],
  blocks: [
    {
      id: 'age_risk',
      outs: [['age_risk', 'num', 0]],
      branches: [
        ['$age < 25', { age_risk: 30 }],
        ['$age > 65', { age_risk: 20 }],
        ['$age >= 25 AND $age <= 35', { age_risk: 5 }],
      ],
      else: { age_risk: 10 },
    },
    {
      id: 'amount_risk',
      outs: [['amount_risk', 'num', 0]],
      branches: [
        ['$transaction_amount > 100000', { amount_risk: 50 }],
        ['$transaction_amount > 50000', { amount_risk: 30 }],
        ['$transaction_amount > 10000', { amount_risk: 15 }],
        ['$transaction_amount > 1000', { amount_risk: 5 }],
      ],
      else: {},
    },
    {
      id: 'country',
      on: '$country_risk',
      outs: [['country_risk_score', 'num', 25]],
      cases: [
        ['low', { country_risk_score: 0 }],
        ['medium', { country_risk_score: 15 }],
        ['high', { country_risk_score: 40 }],
      ],
      default: {},
    },
    {
      id: 'time',
      outs: [['time_risk', 'num', 0]],
      branches: [
        ['$time_of_day >= 0 AND $time_of_day < 6', { time_risk: 25 }],
        ['$time_of_day >= 22', { time_risk: 15 }],
      ],
      else: {},
    },
    {
      id: 'velocity',
      outs: [['velocity_risk', 'num', 0]],
      branches: [
        ['$transactions_24h > 20', { velocity_risk: 40 }],
        ['$transactions_24h > 10', { velocity_risk: 20 }],
        ['$transactions_24h > 5', { velocity_risk: 10 }],
      ],
      else: {},
    },
    {
      id: 'total',
      out: ['total_risk', 'num'],
      expr: '$age_risk + $amount_risk + $country_risk_score + $time_risk + $velocity_risk',
    },
    {
      id: 'action',
      outs: [['action', 'str', 'allow']],
      branches: [
        ['$total_risk >= 100', { action: 'block' }],
        ['$total_risk >= 60', { action: 'review' }],
        ['$total_risk >= 30', { action: 'verify' }],
      ],
      else: {},
    },
  ],
};

describe('demo17 — Crazy Risk Scoring', () => {
  it('low risk', () => {
    const r = rf.evaluate(risk, {
      age: 30,
      transaction_amount: '500',
      country_risk: 'low',
      time_of_day: 14,
      transactions_24h: 2,
    });
    expect(r.total_risk).toBe(5);
    expect(r.action).toBe('allow');
  });

  it('high risk: young + large + high country + late + many tx → block', () => {
    const r = rf.evaluate(risk, {
      age: 22,
      transaction_amount: '120000',
      country_risk: 'high',
      time_of_day: 3,
      transactions_24h: 25,
    });
    expect(r.total_risk).toBe(185);
    expect(r.action).toBe('block');
  });

  it('medium risk → verify', () => {
    const r = rf.evaluate(risk, {
      age: 30,
      transaction_amount: '15000',
      country_risk: 'medium',
      time_of_day: 14,
      transactions_24h: 3,
    });
    expect(r.total_risk).toBe(35);
    expect(r.action).toBe('verify');
  });

  it('senior + medium country + late night → review', () => {
    const r = rf.evaluate(risk, {
      age: 70,
      transaction_amount: '60000',
      country_risk: 'medium',
      time_of_day: 23,
      transactions_24h: 8,
    });
    // 20 + 30 + 15 + 15 + 10 = 90
    expect(r.total_risk).toBe(90);
    expect(r.action).toBe('review');
  });
});
