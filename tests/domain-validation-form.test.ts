import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('demo3 — User registration form validation', () => {
  const userForm: Module = {
    name: 'user_registration',
    ver: '1.0.0',
    inputs: [
      { name: 'age', type: 'num', min: 13, max: 120 },
      { name: 'country', type: 'str', enum: ['TH', 'US', 'JP', 'SG'] },
      { name: 'has_consent', type: 'bool' },
    ],
    outputs: ['eligible', 'tier'],
    blocks: [
      {
        id: 'check',
        outs: [
          ['eligible', 'bool', false],
          ['tier', 'str', 'guest'],
        ],
        branches: [
          ['$has_consent AND $age >= 18', { eligible: true, tier: 'adult' }],
          ['$has_consent AND $age >= 13', { eligible: true, tier: 'minor' }],
        ],
        else: {},
      },
    ],
  };

  it('valid adult', () => {
    const r = rf.evaluate(userForm, { age: 25, country: 'TH', has_consent: true });
    expect(r.eligible).toBe(true);
    expect(r.tier).toBe('adult');
  });

  it('valid minor', () => {
    const r = rf.evaluate(userForm, { age: 15, country: 'JP', has_consent: true });
    expect(r.tier).toBe('minor');
  });

  it('rejected: under min age', () => {
    expect(() => rf.evaluate(userForm, { age: 10, country: 'TH', has_consent: true })).toThrow(/R1_OUT_OF_RANGE/);
  });

  it('rejected: invalid country', () => {
    expect(() => rf.evaluate(userForm, { age: 20, country: 'XX', has_consent: true })).toThrow(/R1_OUT_OF_ENUM/);
  });

  it('no consent → not eligible (no error, fallback)', () => {
    const r = rf.evaluate(userForm, { age: 25, country: 'TH', has_consent: false });
    expect(r.eligible).toBe(false);
    expect(r.tier).toBe('guest');
  });
});

describe('demo15 — Multi-output Grading', () => {
  const grade: Module = {
    name: 'grading',
    ver: '1.0.0',
    inputs: [{ name: 'score', type: 'num', min: 0, max: 100 }],
    outputs: ['letter', 'gpa', 'pass'],
    blocks: [
      {
        id: 'g',
        outs: [
          ['letter', 'str', 'F'],
          ['gpa', 'num', 0],
          ['pass', 'bool', false],
        ],
        branches: [
          ['$score >= 80', { letter: 'A', gpa: 4.0, pass: true }],
          ['$score >= 70', { letter: 'B', gpa: 3.0, pass: true }],
          ['$score >= 60', { letter: 'C', gpa: 2.0, pass: true }],
          ['$score >= 50', { letter: 'D', gpa: 1.0, pass: true }],
        ],
        else: {},
      },
    ],
  };

  it('A grade', () => {
    expect(rf.evaluate(grade, { score: 85 })).toEqual({ letter: 'A', gpa: 4, pass: true });
  });

  it('C grade', () => {
    expect(rf.evaluate(grade, { score: 65 })).toEqual({ letter: 'C', gpa: 2, pass: true });
  });

  it('F (fallback)', () => {
    expect(rf.evaluate(grade, { score: 40 })).toEqual({ letter: 'F', gpa: 0, pass: false });
  });
});
