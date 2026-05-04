import { describe, expect, it } from 'vitest';
import { ConfigError, InputError, RuleFlow } from '../src/index.js';
import type { Manifest, Module } from '../src/index.js';

const simple: Module = {
  name: 'simple',
  ver: '1.0.0',
  inputs: [{ name: 'x', type: 'num' }],
  outputs: ['y'],
  blocks: [{ id: 'b1', out: ['y', 'num'], expr: '$x * 2' }],
};

describe('engine.evaluate', () => {
  it('basic', () => {
    expect(new RuleFlow().evaluate(simple, { x: 5 })).toEqual({ y: 10 });
  });

  it('throws ConfigError on bad config', () => {
    const bad: Module = { name: 'b', ver: '1.0.0', inputs: [], outputs: ['z'], blocks: [] };
    expect(() => new RuleFlow().evaluate(bad, {})).toThrow(ConfigError);
  });

  it('throws InputError on missing input', () => {
    expect(() => new RuleFlow().evaluate(simple, {})).toThrow(InputError);
  });
});

describe('engine.prepare + evaluatePrepared', () => {
  it('prepare once, eval many', () => {
    const rf = new RuleFlow();
    const handle = rf.prepare(simple);
    expect(rf.evaluatePrepared(handle, { x: 1 })).toEqual({ y: 2 });
    expect(rf.evaluatePrepared(handle, { x: 5 })).toEqual({ y: 10 });
    expect(rf.evaluatePrepared(handle, { x: 100 })).toEqual({ y: 200 });
  });

  it('cached by Module reference', () => {
    const rf = new RuleFlow();
    const h1 = rf.prepare(simple);
    const h2 = rf.prepare(simple);
    expect(h1).toBe(h2);
  });
});

describe('engine.evaluateBatch', () => {
  it('multi inputs', () => {
    const rf = new RuleFlow();
    const r = rf.evaluateBatch(simple, [{ x: 1 }, { x: 2 }, { x: 3 }]);
    expect(r.map((x) => (x.success ? x.result : null))).toEqual([{ y: 2 }, { y: 4 }, { y: 6 }]);
  });

  it('partial failures', () => {
    const rf = new RuleFlow();
    const r = rf.evaluateBatch(simple, [{ x: 5 }, {}, { x: 10 }]);
    expect(r[0].success).toBe(true);
    expect(r[1].success).toBe(false);
    expect(r[2].success).toBe(true);
  });
});

describe('engine.test', () => {
  it('valid + run', () => {
    const r = new RuleFlow().test(simple, { x: 7 });
    expect(r.valid).toBe(true);
    expect(r.test_result).toEqual({ y: 14 });
    expect(r.perf?.time_ms).toBeGreaterThanOrEqual(0);
  });

  it('validation only', () => {
    const r = new RuleFlow().test(simple);
    expect(r.valid).toBe(true);
    expect(r.test_result).toBeUndefined();
  });
});

describe('engine.addPack (custom function)', () => {
  it('register + use', () => {
    const rf = new RuleFlow();
    const manifest: Manifest = {
      name: 'mypack',
      ver: '1.0.0',
      funcs: [{ name: 'triple', theme: 'custom', args: [{ name: 'x', type: 'num' }], return: 'num' }],
    };
    rf.addPack(manifest, { triple: (x) => Number(x) * 3 });
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'x', type: 'num' }],
      outputs: ['y'],
      blocks: [{ id: 'b1', out: ['y', 'num'], expr: 'triple($x)' }],
    };
    expect(rf.evaluate(m, { x: 4 })).toEqual({ y: 12 });
  });
});

describe('engine.loadTheme (on-demand via uses)', () => {
  it('auto-load', () => {
    const rf = new RuleFlow();
    expect(rf.loadedThemes()).not.toContain('date');
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      uses: ['date'],
      inputs: [{ name: 'd', type: 'date' }],
      outputs: ['w'],
      blocks: [{ id: 'b1', out: ['w', 'num'], expr: 'weekday($d)' }],
    };
    expect(rf.evaluate(m, { d: '2026-05-04' })).toEqual({ w: 0 });
    expect(rf.loadedThemes()).toContain('date');
  });
});

describe('engine.evaluateTemplate', () => {
  it('runs built-in', () => {
    const r = new RuleFlow().evaluateTemplate('bmi_assessment', { weight: '65', height: '1.75' });
    expect(r.category).toBe('normal');
  });

  it('throws on unknown template', () => {
    expect(() => new RuleFlow().evaluateTemplate('nonexistent', {})).toThrow(ConfigError);
  });
});

describe('engine.info', () => {
  it('reports system info', () => {
    const info = new RuleFlow().info();
    expect(info.ver).toBe('0.1.0');
    expect(info.features).toContain('table');
    expect(info.features).toContain('templates');
    expect(info.loaded_themes).toContain('math');
  });
});
