import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const review: Module = {
  name: 'performance_review',
  ver: '1.0.0',
  inputs: [
    { name: 'quality_score', type: 'num' },
    { name: 'productivity_score', type: 'num' },
    { name: 'teamwork_score', type: 'num' },
    { name: 'communication_score', type: 'num' },
    { name: 'goals_achieved', type: 'num' },
    { name: 'tenure_bonus', type: 'num' },
  ],
  outputs: ['performance_score', 'goal_achievement_bonus', 'total_score', 'rating', 'salary_increase_percent'],
  blocks: [
    {
      id: 'perf',
      out: ['performance_score', 'num'],
      expr:
        '($quality_score * 0.3) + ($productivity_score * 0.25) + ($teamwork_score * 0.25) + ($communication_score * 0.2)',
    },
    {
      id: 'goal_bonus',
      outs: [['goal_achievement_bonus', 'num', 0]],
      branches: [
        ['$goals_achieved >= 90', { goal_achievement_bonus: 15 }],
        ['$goals_achieved >= 80', { goal_achievement_bonus: 10 }],
        ['$goals_achieved >= 70', { goal_achievement_bonus: 5 }],
      ],
      else: {},
    },
    {
      id: 'total',
      out: ['total_score', 'num'],
      expr: '$performance_score + $goal_achievement_bonus + $tenure_bonus',
    },
    {
      id: 'rating',
      outs: [
        ['rating', 'str', 'Below Expectations'],
        ['salary_increase_percent', 'num', 0],
      ],
      branches: [
        ['$total_score >= 95', { rating: 'Exceptional', salary_increase_percent: 12 }],
        ['$total_score >= 85', { rating: 'Exceeds Expectations', salary_increase_percent: 8 }],
        ['$total_score >= 75', { rating: 'Meets Expectations', salary_increase_percent: 5 }],
        ['$total_score >= 65', { rating: 'Needs Improvement', salary_increase_percent: 2 }],
      ],
      else: {},
    },
  ],
};

describe('demo6 — Employee Performance Review', () => {
  it('Exceptional', () => {
    const r = rf.evaluate(review, {
      quality_score: 95,
      productivity_score: 88,
      teamwork_score: 92,
      communication_score: 90,
      goals_achieved: 95,
      tenure_bonus: 10,
    });
    expect(r.performance_score).toBe(91.5);
    expect(r.goal_achievement_bonus).toBe(15);
    expect(r.total_score).toBe(116.5);
    expect(r.rating).toBe('Exceptional');
    expect(r.salary_increase_percent).toBe(12);
  });

  it('Average → Meets Expectations', () => {
    const r = rf.evaluate(review, {
      quality_score: 75,
      productivity_score: 70,
      teamwork_score: 78,
      communication_score: 72,
      goals_achieved: 65,
      tenure_bonus: 5,
    });
    expect(r.performance_score).toBe(73.9);
    expect(r.goal_achievement_bonus).toBe(0);
    expect(r.total_score).toBe(78.9);
    expect(r.rating).toBe('Meets Expectations');
    expect(r.salary_increase_percent).toBe(5);
  });

  it('Below expectations', () => {
    const r = rf.evaluate(review, {
      quality_score: 60,
      productivity_score: 55,
      teamwork_score: 65,
      communication_score: 58,
      goals_achieved: 45,
      tenure_bonus: 2,
    });
    expect(r.rating).toBe('Below Expectations');
    expect(r.salary_increase_percent).toBe(0);
  });
});
