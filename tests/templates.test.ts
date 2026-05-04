import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';

const rf = new RuleFlow();

describe('built-in templates', () => {
  it('lists built-in templates', () => {
    const all = rf.getTemplates();
    const names = all.map((t) => t.name).sort();
    expect(names).toEqual([
      'auto_insurance_premium',
      'bmi_assessment',
      'credit_card_approval',
      'employee_leave_request',
      'loan_approval',
      'performance_review',
      'property_valuation',
      'student_grading',
      'support_ticket_sla',
      'tier_pricing',
    ]);
  });

  it('filter by category', () => {
    expect(rf.getTemplates('financial').map((t) => t.name).sort()).toEqual([
      'credit_card_approval',
      'loan_approval',
    ]);
    expect(rf.getTemplates('healthcare').map((t) => t.name)).toEqual(['bmi_assessment']);
    expect(rf.getTemplates('insurance').map((t) => t.name)).toEqual(['auto_insurance_premium']);
  });

  it('search by keyword', () => {
    expect(rf.searchTemplates('loan').some((t) => t.name === 'loan_approval')).toBe(true);
    expect(rf.searchTemplates('bmi').some((t) => t.name === 'bmi_assessment')).toBe(true);
  });

  it('categories', () => {
    const cats = rf.templateCategories().sort();
    expect(cats).toEqual(['ecommerce', 'education', 'financial', 'healthcare', 'hr', 'insurance', 'real_estate', 'support']);
  });

  it('export + import roundtrip', () => {
    const json = rf.exportTemplate('bmi_assessment');
    const rf2 = new RuleFlow();
    const name = rf2.importTemplate(json);
    expect(name).toBe('bmi_assessment');
    expect(rf2.getTemplate(name)?.config.name).toBe('bmi_assessment');
  });
});

describe('every built-in template example passes', () => {
  for (const meta of rf.getTemplates()) {
    const tpl = rf.getTemplate(meta.name);
    if (!tpl) continue;
    for (let i = 0; i < tpl.examples.length; i++) {
      it(`${meta.name} example ${i} (${tpl.examples[i].name})`, () => {
        const result = rf.testTemplate(meta.name, i);
        if (!result.passed) {
          throw new Error(
            `expected ${JSON.stringify(result.expected)}, got ${JSON.stringify(result.actual)}`,
          );
        }
        expect(result.passed).toBe(true);
      });
    }
  }
});
