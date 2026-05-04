import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

describe('demo14 — Trading Bot: Stop Loss Checker', () => {
  const stopLoss: Module = {
    name: 'stop_loss',
    ver: '1.0.0',
    inputs: [
      { name: 'current_value', type: 'dec' },
      { name: 'initial_value', type: 'dec' },
    ],
    outputs: ['loss_percent', 'stop_trading', 'action', 'reason'],
    blocks: [
      {
        id: 'loss',
        out: ['loss_percent', 'dec'],
        expr: '(($current_value - $initial_value) / $initial_value) * 100',
      },
      {
        id: 'decide',
        outs: [
          ['stop_trading', 'bool', false],
          ['action', 'str', 'CONTINUE'],
          ['reason', 'str', 'Loss within acceptable range'],
        ],
        branches: [
          ['$loss_percent <= -5', { stop_trading: true, action: 'STOP', reason: 'Loss exceeds 5%' }],
        ],
        else: {},
      },
    ],
  };

  it('Safe scenario (98k from 100k)', () => {
    const r = rf.evaluate(stopLoss, { current_value: '98000', initial_value: '100000' });
    expect(r.loss_percent).toBe('-2');
    expect(r.stop_trading).toBe(false);
    expect(r.action).toBe('CONTINUE');
  });

  it('Warning scenario (95k from 100k)', () => {
    const r = rf.evaluate(stopLoss, { current_value: '95000', initial_value: '100000' });
    expect(r.loss_percent).toBe('-5');
    expect(r.stop_trading).toBe(true);
    expect(r.action).toBe('STOP');
  });

  it('Stop scenario (92k from 100k)', () => {
    const r = rf.evaluate(stopLoss, { current_value: '92000', initial_value: '100000' });
    expect(r.loss_percent).toBe('-8');
    expect(r.stop_trading).toBe(true);
    expect(r.action).toBe('STOP');
  });
});

describe('demo14 — Risk Assessment (multi-factor scoring)', () => {
  const riskAssess: Module = {
    name: 'risk_assessment',
    ver: '1.0.0',
    inputs: [
      { name: 'portfolio_loss_percent', type: 'num' },
      { name: 'volatility_percent', type: 'num' },
      { name: 'volume_spike_ratio', type: 'num' },
    ],
    outputs: ['loss_risk_score', 'volatility_risk_score', 'volume_risk_score', 'total_risk', 'risk_level', 'recommendation'],
    blocks: [
      {
        id: 'loss_risk',
        outs: [['loss_risk_score', 'num', 0]],
        branches: [
          ['$portfolio_loss_percent <= -15', { loss_risk_score: 50 }],
          ['$portfolio_loss_percent <= -10', { loss_risk_score: 30 }],
          ['$portfolio_loss_percent <= -5', { loss_risk_score: 15 }],
          ['$portfolio_loss_percent <= -2', { loss_risk_score: 5 }],
        ],
        else: {},
      },
      {
        id: 'vol_risk',
        outs: [['volatility_risk_score', 'num', 0]],
        branches: [
          ['$volatility_percent >= 8', { volatility_risk_score: 25 }],
          ['$volatility_percent >= 5', { volatility_risk_score: 15 }],
          ['$volatility_percent >= 3', { volatility_risk_score: 8 }],
        ],
        else: {},
      },
      {
        id: 'volume_risk',
        outs: [['volume_risk_score', 'num', 0]],
        branches: [
          ['$volume_spike_ratio >= 5', { volume_risk_score: 20 }],
          ['$volume_spike_ratio >= 3', { volume_risk_score: 12 }],
          ['$volume_spike_ratio >= 2', { volume_risk_score: 5 }],
        ],
        else: {},
      },
      {
        id: 'total',
        out: ['total_risk', 'num'],
        expr: '$loss_risk_score + $volatility_risk_score + $volume_risk_score',
      },
      {
        id: 'level',
        outs: [
          ['risk_level', 'str', 'low'],
          ['recommendation', 'str', 'Continue trading'],
        ],
        branches: [
          ['$total_risk >= 70', { risk_level: 'critical', recommendation: 'Stop trading immediately' }],
          ['$total_risk >= 40', { risk_level: 'high', recommendation: 'Reduce position size' }],
          ['$total_risk >= 20', { risk_level: 'medium', recommendation: 'Monitor closely' }],
        ],
        else: {},
      },
    ],
  };

  it('low risk (small loss, low vol)', () => {
    const r = rf.evaluate(riskAssess, {
      portfolio_loss_percent: -1,
      volatility_percent: 2,
      volume_spike_ratio: 1,
    });
    expect(r.total_risk).toBe(0);
    expect(r.risk_level).toBe('low');
  });

  it('medium risk', () => {
    const r = rf.evaluate(riskAssess, {
      portfolio_loss_percent: -6,
      volatility_percent: 4,
      volume_spike_ratio: 2,
    });
    // 15 + 8 + 5 = 28
    expect(r.total_risk).toBe(28);
    expect(r.risk_level).toBe('medium');
  });

  it('critical risk', () => {
    const r = rf.evaluate(riskAssess, {
      portfolio_loss_percent: -20,
      volatility_percent: 10,
      volume_spike_ratio: 6,
    });
    // 50 + 25 + 20 = 95
    expect(r.total_risk).toBe(95);
    expect(r.risk_level).toBe('critical');
  });
});
