import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const pricing: Module = {
  name: 'dynamic_pricing',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'base_price', type: 'dec' },
    { name: 'demand_level', type: 'str' },
    { name: 'inventory_level', type: 'num' },
    { name: 'price_vs_competitor', type: 'num' },
    { name: 'customer_tier', type: 'str' },
  ],
  outputs: [
    'demand_multiplier',
    'inventory_multiplier',
    'competitor_adjustment',
    'dynamic_price',
    'discount_eligible',
    'final_price',
  ],
  blocks: [
    {
      id: 'demand_mult',
      on: '$demand_level',
      outs: [['demand_multiplier', 'num', 1]],
      cases: [
        ['High', { demand_multiplier: 1.3 }],
        ['Medium', { demand_multiplier: 1.0 }],
        ['Low', { demand_multiplier: 0.85 }],
      ],
      default: {},
    },
    {
      id: 'inv_mult',
      outs: [['inventory_multiplier', 'num', 1]],
      branches: [
        ['$inventory_level <= 10', { inventory_multiplier: 1.25 }],
        ['$inventory_level <= 50', { inventory_multiplier: 1.05 }],
        ['$inventory_level >= 100', { inventory_multiplier: 0.9 }],
      ],
      else: {},
    },
    {
      id: 'competitor',
      outs: [['competitor_adjustment', 'num', 1]],
      branches: [
        ['$price_vs_competitor >= 1.2', { competitor_adjustment: 0.95 }],
        ['$price_vs_competitor <= 0.9', { competitor_adjustment: 1.05 }],
      ],
      else: {},
    },
    {
      id: 'dynamic',
      out: ['dynamic_price', 'dec'],
      expr: 'currency_round($base_price * $demand_multiplier * $inventory_multiplier * $competitor_adjustment)',
    },
    {
      id: 'discount',
      on: '$customer_tier',
      outs: [['discount_eligible', 'num', 0]],
      cases: [
        ['VIP', { discount_eligible: 0.15 }],
        ['Gold', { discount_eligible: 0.1 }],
        ['Silver', { discount_eligible: 0.05 }],
      ],
      default: {},
    },
    {
      id: 'final',
      out: ['final_price', 'dec'],
      expr: 'currency_round($dynamic_price * (1 - $discount_eligible))',
    },
  ],
};

describe('demo7 — Dynamic Pricing', () => {
  it('High demand, low inventory, VIP', () => {
    const r = rf.evaluate(pricing, {
      base_price: '100',
      demand_level: 'High',
      inventory_level: 8,
      price_vs_competitor: 1.05,
      customer_tier: 'VIP',
    });
    expect(r.demand_multiplier).toBe(1.3);
    expect(r.inventory_multiplier).toBe(1.25);
    expect(r.dynamic_price).toBe('162.5');
    expect(r.final_price).toBe('138.13');
  });

  it('Low demand, high inventory, Silver', () => {
    const r = rf.evaluate(pricing, {
      base_price: '100',
      demand_level: 'Low',
      inventory_level: 150,
      price_vs_competitor: 0.85,
      customer_tier: 'Silver',
    });
    expect(r.demand_multiplier).toBe(0.85);
    expect(r.inventory_multiplier).toBe(0.9);
    expect(r.competitor_adjustment).toBe(1.05);
    expect(r.dynamic_price).toBe('80.33');
    expect(r.final_price).toBe('76.31');
  });

  it('Medium demand, mid inventory, Gold', () => {
    const r = rf.evaluate(pricing, {
      base_price: '100',
      demand_level: 'Medium',
      inventory_level: 50,
      price_vs_competitor: 1.0,
      customer_tier: 'Gold',
    });
    expect(r.dynamic_price).toBe('105');
    expect(r.final_price).toBe('94.5');
  });
});
