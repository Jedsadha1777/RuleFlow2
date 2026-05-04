import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const form: Module = {
  name: 'order_form',
  ver: '1.0.0',
  inputs: [
    { name: 'price', type: 'dec' },
    { name: 'qty', type: 'num', min: 1, max: 100 },
    { name: 'tier', type: 'str', enum: ['gold', 'silver', 'bronze'] },
    { name: 'note', type: 'str', nullable: true },
  ],
  outputs: ['total'],
  blocks: [{ id: 't', out: ['total', 'dec'], expr: '$price * $qty' }],
};

describe('validateField', () => {
  it('valid field', () => {
    const r = rf.validateField('qty', 5, form);
    expect(r.valid).toBe(true);
    expect(r.converted).toBe(5);
    expect(r.errors).toEqual([]);
  });

  it('invalid: out of range', () => {
    const r = rf.validateField('qty', 200, form);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('max');
  });

  it('invalid: not in enum', () => {
    const r = rf.validateField('tier', 'platinum', form);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('one of');
  });

  it('invalid: type mismatch', () => {
    const r = rf.validateField('qty', 'abc', form);
    expect(r.valid).toBe(false);
  });

  it('nullable field can be null', () => {
    const r = rf.validateField('note', null, form);
    expect(r.valid).toBe(true);
  });

  it('required field cannot be null', () => {
    const r = rf.validateField('qty', null, form);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toBe('required');
  });

  it('unknown field', () => {
    const r = rf.validateField('mystery', 1, form);
    expect(r.valid).toBe(false);
    expect(r.errors[0]).toContain('unknown field');
  });
});

describe('validatePartial', () => {
  it('all required provided', () => {
    const r = rf.validatePartial({ price: '100', qty: 5, tier: 'gold' }, form);
    expect(r.valid).toBe(true);
    expect(r.missing_required).toEqual([]);
  });

  it('partial missing required', () => {
    const r = rf.validatePartial({ price: '100' }, form);
    expect(r.valid).toBe(false);
    expect(r.missing_required.sort()).toEqual(['qty', 'tier']);
  });

  it('invalid value reported', () => {
    const r = rf.validatePartial({ price: '100', qty: 200, tier: 'gold' }, form);
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});

describe('validationStatus', () => {
  it('empty inputs', () => {
    const r = rf.validationStatus({}, form);
    expect(r.ready_to_submit).toBe(false);
    expect(r.summary.total).toBe(4);
    expect(r.summary.provided).toBe(0);
    expect(r.summary.missing).toBe(4);
    expect(r.field_validation.progress).toBe(0);
  });

  it('all fields valid', () => {
    const r = rf.validationStatus({ price: '100', qty: 5, tier: 'gold', note: 'ok' }, form);
    expect(r.ready_to_submit).toBe(true);
    expect(r.summary.invalid).toBe(0);
    expect(r.field_validation.progress).toBe(100);
  });

  it('partial progress', () => {
    const r = rf.validationStatus({ price: '100', qty: 5 }, form);
    expect(r.ready_to_submit).toBe(false);
    expect(r.summary.provided).toBe(2);
    expect(r.field_validation.missing_required).toEqual(['tier']);
    expect(r.field_validation.progress).toBe(67);
  });
});

describe('livePreview', () => {
  it('returns outputs when ready', () => {
    const r = rf.livePreview({ price: '100', qty: 5, tier: 'gold' }, form);
    expect(r.ready).toBe(true);
    expect(r.outputs).toEqual({ total: '500' });
  });

  it('reports missing required', () => {
    const r = rf.livePreview({ price: '100' }, form);
    expect(r.ready).toBe(false);
    expect(r.missing_required.sort()).toEqual(['qty', 'tier']);
  });
});

describe('fieldSuggestions', () => {
  it('enum suggestions', () => {
    expect(rf.fieldSuggestions('tier', form)).toEqual(['gold', 'silver', 'bronze']);
  });

  it('enum filtered by query', () => {
    expect(rf.fieldSuggestions('tier', form, 'sil')).toEqual(['silver']);
  });

  it('bool suggestions', () => {
    const m: Module = {
      name: 'm',
      ver: '1.0.0',
      inputs: [{ name: 'flag', type: 'bool' }],
      outputs: ['x'],
      blocks: [{ id: 'b', out: ['x', 'bool'], expr: '$flag' }],
    };
    expect(rf.fieldSuggestions('flag', m)).toEqual(['true', 'false']);
  });

  it('no suggestions for free types', () => {
    expect(rf.fieldSuggestions('price', form)).toEqual([]);
  });
});

describe('batchValidateFields', () => {
  it('validates each updated field', () => {
    const r = rf.batchValidateFields(
      { qty: 50, tier: 'invalid' },
      { price: '100', tier: 'gold' },
      form,
    );
    expect(r.qty.valid).toBe(true);
    expect(r.tier.valid).toBe(false);
  });

  it('only validates updates, not unchanged', () => {
    const r = rf.batchValidateFields({ price: '99' }, { price: '100', qty: 5, tier: 'gold' }, form);
    expect(Object.keys(r)).toEqual(['price']);
  });
});
