import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const ltv: Module = {
  name: 'customer_ltv',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'avg_order_value', type: 'dec' },
    { name: 'orders_per_month', type: 'num' },
    { name: 'customer_segment', type: 'str' },
  ],
  outputs: ['monthly_value', 'annual_value', 'retention_factor', 'lifetime_months', 'customer_ltv', 'ltv_category'],
  blocks: [
    { id: 'monthly', out: ['monthly_value', 'dec'], expr: '$avg_order_value * $orders_per_month' },
    { id: 'annual', out: ['annual_value', 'dec'], expr: '$monthly_value * 12' },
    {
      id: 'retention',
      on: '$customer_segment',
      outs: [['retention_factor', 'num', 1]],
      cases: [
        ['Premium', { retention_factor: 36 }],
        ['Standard', { retention_factor: 24 }],
        ['Basic', { retention_factor: 12 }],
      ],
      default: {},
    },
    { id: 'lifetime', out: ['lifetime_months', 'num'], expr: '$retention_factor * 1.0' },
    { id: 'ltv_calc', out: ['customer_ltv', 'dec'], expr: 'currency_round($monthly_value * $lifetime_months)' },
    {
      id: 'category',
      outs: [['ltv_category', 'str', 'Low Value']],
      branches: [
        ['$customer_ltv >= 5000', { ltv_category: 'High Value' }],
        ['$customer_ltv >= 2000', { ltv_category: 'Medium Value' }],
      ],
      else: {},
    },
  ],
};

describe('demo7 — Customer Lifetime Value', () => {
  it('Premium customer', () => {
    const r = rf.evaluate(ltv, { avg_order_value: '85', orders_per_month: 2.5, customer_segment: 'Premium' });
    expect(r.monthly_value).toBe('212.5');
    expect(r.annual_value).toBe('2550');
    expect(r.retention_factor).toBe(36);
    expect(r.customer_ltv).toBe('7650');
    expect(r.ltv_category).toBe('High Value');
  });

  it('Standard customer', () => {
    const r = rf.evaluate(ltv, { avg_order_value: '50', orders_per_month: 1.5, customer_segment: 'Standard' });
    expect(r.monthly_value).toBe('75');
    expect(r.customer_ltv).toBe('1800');
    expect(r.ltv_category).toBe('Low Value');
  });

  it('Basic customer mid-LTV', () => {
    const r = rf.evaluate(ltv, { avg_order_value: '200', orders_per_month: 1, customer_segment: 'Basic' });
    expect(r.customer_ltv).toBe('2400');
    expect(r.ltv_category).toBe('Medium Value');
  });
});
