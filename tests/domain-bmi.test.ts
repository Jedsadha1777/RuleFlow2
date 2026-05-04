import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const bmi: Module = {
  name: 'bmi_health',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'weight', type: 'dec' },
    { name: 'height', type: 'dec' },
  ],
  outputs: ['bmi', 'bmi_category', 'health_risk_score', 'recommendation'],
  blocks: [
    { id: 'calc', out: ['bmi', 'dec'], expr: 'currency_round($weight / ($height * $height))' },
    {
      id: 'classify',
      outs: [
        ['bmi_category', 'str', 'Obese'],
        ['health_risk_score', 'num', 90],
        ['recommendation', 'str', 'Consult doctor immediately'],
      ],
      branches: [
        ['$bmi < 18.5', { bmi_category: 'Underweight', health_risk_score: 60, recommendation: 'Consult nutritionist' }],
        ['$bmi < 25', { bmi_category: 'Normal', health_risk_score: 20, recommendation: 'Maintain current lifestyle' }],
        ['$bmi < 30', { bmi_category: 'Overweight', health_risk_score: 50, recommendation: 'Exercise + diet plan' }],
      ],
      else: {},
    },
  ],
};

describe('demo5 — BMI Health Assessment', () => {
  it('Normal weight (70 kg / 1.75 m)', () => {
    const r = rf.evaluate(bmi, { weight: '70', height: '1.75' });
    expect(r.bmi).toBe('22.86');
    expect(r.bmi_category).toBe('Normal');
    expect(r.health_risk_score).toBe(20);
  });

  it('Overweight (85 kg / 1.70 m)', () => {
    const r = rf.evaluate(bmi, { weight: '85', height: '1.70' });
    expect(r.bmi).toBe('29.41');
    expect(r.bmi_category).toBe('Overweight');
    expect(r.health_risk_score).toBe(50);
  });

  it('Underweight (45 kg / 1.65 m)', () => {
    const r = rf.evaluate(bmi, { weight: '45', height: '1.65' });
    expect(r.bmi).toBe('16.53');
    expect(r.bmi_category).toBe('Underweight');
  });

  it('Obese (95 kg / 1.68 m)', () => {
    const r = rf.evaluate(bmi, { weight: '95', height: '1.68' });
    expect(r.bmi).toBe('33.66');
    expect(r.bmi_category).toBe('Obese');
    expect(r.health_risk_score).toBe(90);
  });

  it('Boundary: BMI exactly 25 → Overweight', () => {
    const r = rf.evaluate(bmi, { weight: '76.5625', height: '1.75' });
    expect(r.bmi).toBe('25');
    expect(r.bmi_category).toBe('Overweight');
  });
});
