import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const m: Module = {
  name: 'loan_app',
  ver: '1.0.0',
  inputs: [
    { name: 'income', type: 'dec' },
    { name: 'age', type: 'num', min: 18, max: 99 },
    { name: 'tier', type: 'str', enum: ['gold', 'silver'] },
    { name: 'has_consent', type: 'bool' },
    { name: 'birthdate', type: 'date' },
  ],
  outputs: ['decision'],
  blocks: [{ id: 'b', out: ['decision', 'str'], expr: "'approved'" }],
};

describe('generateSchema — JSON Schema', () => {
  it('produces draft-07 JSON Schema', () => {
    const s = JSON.parse(rf.generateSchema(m, 'json-schema'));
    expect(s.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(s.title).toBe('loan_app');
    expect(s.type).toBe('object');
    expect(s.properties.income.type).toBe('string');
    expect(s.properties.income.format).toBe('decimal');
    expect(s.properties.age.type).toBe('number');
    expect(s.properties.age.minimum).toBe(18);
    expect(s.properties.age.maximum).toBe(99);
    expect(s.properties.tier.enum).toEqual(['gold', 'silver']);
    expect(s.properties.has_consent.type).toBe('boolean');
    expect(s.properties.birthdate.format).toBe('date');
    expect(s.required).toEqual(['income', 'age', 'tier', 'has_consent', 'birthdate']);
  });
});

describe('generateSchema — OpenAPI', () => {
  it('produces components.schemas entry', () => {
    const s = JSON.parse(rf.generateSchema(m, 'openapi'));
    expect(s.components.schemas.loan_app.type).toBe('object');
    expect(s.components.schemas.loan_app.required).toEqual(['income', 'age', 'tier', 'has_consent', 'birthdate']);
  });
});

describe('generateSchema — TypeScript', () => {
  it('produces interface declarations', () => {
    const s = rf.generateSchema(m, 'typescript');
    expect(s).toContain('export interface LoanAppInputs');
    expect(s).toContain('income: string;');
    expect(s).toContain('age: number;');
    expect(s).toContain('has_consent: boolean;');
    expect(s).toContain('export interface LoanAppOutputs');
    expect(s).toContain('decision: unknown;');
  });
});

describe('generateSchema — HTML form', () => {
  it('produces form fields', () => {
    const s = rf.generateSchema(m, 'html-form');
    expect(s).toContain('<form name="loan_app">');
    expect(s).toContain('type="number"');
    expect(s).toContain('min="18"');
    expect(s).toContain('max="99"');
    expect(s).toContain('<select id="tier"');
    expect(s).toContain('type="checkbox"');
    expect(s).toContain('type="date"');
    expect(s).toContain('required');
  });
});

describe('generateSchema — React component', () => {
  it('produces JSX form', () => {
    const s = rf.generateSchema(m, 'react');
    expect(s).toContain('export function LoanAppForm()');
    expect(s).toContain('<form name="loan_app">');
    expect(s).toContain('type="number"');
    expect(s).toContain('<select');
  });
});

describe('generateSchema — Joi', () => {
  it('produces Joi schema', () => {
    const s = rf.generateSchema(m, 'joi');
    expect(s).toContain("import Joi from 'joi';");
    expect(s).toContain('export const loanAppSchema = Joi.object({');
    expect(s).toContain('Joi.number()');
    expect(s).toContain('.min(18)');
    expect(s).toContain('.max(99)');
    expect(s).toContain('.valid("gold", "silver")');
    expect(s).toContain('Joi.boolean()');
    expect(s).toContain('.required()');
  });
});

describe('generateSchema — Yup', () => {
  it('produces Yup schema', () => {
    const s = rf.generateSchema(m, 'yup');
    expect(s).toContain("import * as yup from 'yup';");
    expect(s).toContain('export const loanAppSchema = yup.object({');
    expect(s).toContain('yup.number()');
    expect(s).toContain('.oneOf(["gold", "silver"])');
    expect(s).toContain('.required()');
  });
});

describe('generateSchema — Laravel', () => {
  it('produces Laravel rules array', () => {
    const s = JSON.parse(rf.generateSchema(m, 'laravel'));
    expect(s.income).toContain('numeric');
    expect(s.age).toContain('numeric');
    expect(s.age).toContain('min:18');
    expect(s.age).toContain('max:99');
    expect(s.tier).toContain('in:gold,silver');
    expect(s.has_consent).toContain('boolean');
    expect(s.birthdate).toContain('date_format:Y-m-d');
  });
});
