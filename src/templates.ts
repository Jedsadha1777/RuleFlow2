import type { Inputs, Module, Outputs } from './types.js';

export interface TemplateMeta {
  name: string;
  category: string;
  description: string;
  tags: string[];
}

export interface TemplateExample {
  name: string;
  inputs: Inputs;
  expected: Outputs;
}

export interface Template {
  config: Module;
  meta: TemplateMeta;
  examples: TemplateExample[];
}

const LOAN_APPROVAL: Template = {
  config: {
    name: 'loan_approval',
    ver: '1.0.0',
    uses: ['money'],
    inputs: [
      { name: 'annual_income', type: 'dec' },
      { name: 'monthly_debt', type: 'dec' },
      { name: 'credit_score', type: 'num' },
      { name: 'employment_years', type: 'num' },
      { name: 'tier', type: 'str' },
    ],
    outputs: [
      'monthly_income',
      'dti_ratio',
      'credit_points',
      'income_points',
      'employment_points',
      'total_score',
      'decision',
      'interest_rate',
      'max_amount',
      'term_years',
    ],
    blocks: [
      { id: 'calc_monthly_income', out: ['monthly_income', 'dec'], expr: '$annual_income / 12' },
      { id: 'calc_dti', out: ['dti_ratio', 'dec'], expr: 'percent_of($monthly_debt, $monthly_income)' },
      {
        id: 'score_credit',
        outs: [['credit_points', 'num', 0]],
        branches: [
          ['$credit_score >= 750', { credit_points: 100 }],
          ['$credit_score >= 700', { credit_points: 80 }],
          ['$credit_score >= 650', { credit_points: 60 }],
          ['$credit_score >= 600', { credit_points: 40 }],
          ['$credit_score >= 550', { credit_points: 20 }],
        ],
        else: {},
      },
      {
        id: 'score_income',
        outs: [['income_points', 'num', 0]],
        branches: [
          ['$monthly_income >= 10000', { income_points: 50 }],
          ['$monthly_income >= 7500', { income_points: 40 }],
          ['$monthly_income >= 5000', { income_points: 30 }],
          ['$monthly_income >= 3000', { income_points: 20 }],
          ['$monthly_income >= 2000', { income_points: 10 }],
        ],
        else: {},
      },
      {
        id: 'score_employment',
        outs: [['employment_points', 'num', 0]],
        branches: [
          ['$employment_years >= 5', { employment_points: 30 }],
          ['$employment_years >= 3', { employment_points: 20 }],
          ['$employment_years >= 1', { employment_points: 10 }],
          ['$employment_years >= 0.5', { employment_points: 5 }],
        ],
        else: {},
      },
      {
        id: 'calc_total',
        out: ['total_score', 'num'],
        expr: '$credit_points + $income_points + $employment_points',
      },
      {
        id: 'decision',
        outs: [
          ['decision', 'str', 'rejected'],
          ['interest_rate', 'dec', '0'],
          ['max_amount', 'dec', '0'],
          ['term_years', 'num', 0],
        ],
        branches: [
          [
            '$total_score >= 150',
            { decision: 'approved', interest_rate: '3.5', max_amount: '1000000', term_years: 30 },
          ],
          [
            '$total_score >= 120',
            { decision: 'approved', interest_rate: '4.5', max_amount: '500000', term_years: 25 },
          ],
          [
            '$total_score >= 80',
            { decision: 'conditional', interest_rate: '6.5', max_amount: '200000', term_years: 15 },
          ],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'loan_approval',
    category: 'financial',
    description: 'Multi-criteria loan approval with credit/income/employment scoring',
    tags: ['loan', 'credit', 'scoring'],
  },
  examples: [
    {
      name: 'high_income_excellent_credit',
      inputs: {
        annual_income: '120000',
        monthly_debt: '500',
        credit_score: 780,
        employment_years: 6,
        tier: 'gold',
      },
      expected: {
        monthly_income: '10000',
        dti_ratio: '5',
        credit_points: 100,
        income_points: 50,
        employment_points: 30,
        total_score: 180,
        decision: 'approved',
        interest_rate: '3.5',
        max_amount: '1000000',
        term_years: 30,
      },
    },
    {
      name: 'mid_score_conditional',
      inputs: {
        annual_income: '60000',
        monthly_debt: '500',
        credit_score: 680,
        employment_years: 2,
        tier: 'silver',
      },
      expected: {
        monthly_income: '5000',
        dti_ratio: '10',
        credit_points: 60,
        income_points: 30,
        employment_points: 10,
        total_score: 100,
        decision: 'conditional',
        interest_rate: '6.5',
        max_amount: '200000',
        term_years: 15,
      },
    },
  ],
};

const BMI_ASSESSMENT: Template = {
  config: {
    name: 'bmi_assessment',
    ver: '1.0.0',
    inputs: [
      { name: 'weight', type: 'dec' },
      { name: 'height', type: 'dec' },
    ],
    outputs: ['bmi', 'category', 'risk_level', 'advice'],
    blocks: [
      { id: 'calc_bmi', out: ['bmi', 'dec'], expr: '$weight / ($height * $height)' },
      {
        id: 'categorize',
        outs: [
          ['category', 'str', 'obese'],
          ['risk_level', 'str', 'high'],
          ['advice', 'str', 'consult_doctor'],
        ],
        branches: [
          ['$bmi < 18.5', { category: 'underweight', risk_level: 'low', advice: 'increase_intake' }],
          ['$bmi < 25', { category: 'normal', risk_level: 'low', advice: 'maintain' }],
          ['$bmi < 30', { category: 'overweight', risk_level: 'medium', advice: 'exercise_diet' }],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'bmi_assessment',
    category: 'healthcare',
    description: 'BMI calculation with category, risk level, advice',
    tags: ['bmi', 'health'],
  },
  examples: [
    {
      name: 'normal',
      inputs: { weight: '65', height: '1.75' },
      expected: { bmi: '21.224489795918367346', category: 'normal', risk_level: 'low', advice: 'maintain' },
    },
    {
      name: 'underweight',
      inputs: { weight: '45', height: '1.70' },
      expected: { bmi: '15.570934256055363321', category: 'underweight', risk_level: 'low', advice: 'increase_intake' },
    },
    {
      name: 'obese',
      inputs: { weight: '110', height: '1.65' },
      expected: { bmi: '40.40404040404040404', category: 'obese', risk_level: 'high', advice: 'consult_doctor' },
    },
  ],
};

const TIER_PRICING: Template = {
  config: {
    name: 'tier_pricing',
    ver: '1.0.0',
    uses: ['date', 'money', 'logic'],
    inputs: [
      { name: 'base_price', type: 'dec' },
      { name: 'tier', type: 'str' },
      { name: 'booking_date', type: 'date' },
      { name: 'is_first_time', type: 'bool' },
    ],
    outputs: ['tier_discount_pct', 'weekend_multiplier', 'first_time_bonus', 'final_price'],
    blocks: [
      {
        id: 'tier_lookup',
        on: '$tier',
        outs: [['tier_discount_pct', 'num', 0]],
        cases: [
          ['gold', { tier_discount_pct: 15 }],
          ['silver', { tier_discount_pct: 10 }],
          ['bronze', { tier_discount_pct: 5 }],
        ],
        default: {},
      },
      {
        id: 'weekend_check',
        out: ['weekend_multiplier', 'num'],
        expr: 'pickIf(is_weekend($booking_date), 1.5, 1.0)',
      },
      {
        id: 'first_time_bonus',
        out: ['first_time_bonus', 'num'],
        expr: 'pickIf($is_first_time, 5, 0)',
      },
      {
        id: 'calc_final',
        out: ['final_price', 'dec'],
        expr:
          'currency_round(apply_discount($base_price, $tier_discount_pct + $first_time_bonus) * $weekend_multiplier)',
      },
    ],
  },
  meta: {
    name: 'tier_pricing',
    category: 'ecommerce',
    description: 'Pricing with tier discount + weekend multiplier + first-time bonus',
    tags: ['pricing', 'discount'],
  },
  examples: [
    {
      name: 'gold_weekend_first_time',
      inputs: { base_price: '1000', tier: 'gold', booking_date: '2026-05-09', is_first_time: true },
      expected: {
        tier_discount_pct: 15,
        weekend_multiplier: 1.5,
        first_time_bonus: 5,
        final_price: '1200',
      },
    },
    {
      name: 'bronze_weekday_returning',
      inputs: { base_price: '1000', tier: 'bronze', booking_date: '2026-05-04', is_first_time: false },
      expected: {
        tier_discount_pct: 5,
        weekend_multiplier: 1,
        first_time_bonus: 0,
        final_price: '950',
      },
    },
  ],
};

const CREDIT_CARD_APPROVAL: Template = {
  config: {
    name: 'credit_card_approval',
    ver: '1.0.0',
    inputs: [
      { name: 'monthly_income', type: 'dec' },
      { name: 'credit_score', type: 'num' },
      { name: 'existing_cards', type: 'num' },
      { name: 'age', type: 'num' },
    ],
    outputs: ['decision', 'card_type', 'credit_limit', 'annual_fee'],
    blocks: [
      {
        id: 'eligibility',
        outs: [['eligible', 'bool', false]],
        branches: [
          [
            '$age >= 21 AND $monthly_income >= 1500 AND $credit_score >= 600 AND $existing_cards <= 5',
            { eligible: true },
          ],
        ],
        else: {},
      },
      {
        id: 'card_decision',
        outs: [
          ['decision', 'str', 'rejected'],
          ['card_type', 'str', 'none'],
          ['credit_limit', 'dec', '0'],
          ['annual_fee', 'dec', '0'],
        ],
        branches: [
          [
            '$eligible AND $monthly_income >= 10000 AND $credit_score >= 750',
            { decision: 'approved', card_type: 'platinum', credit_limit: '500000', annual_fee: '5000' },
          ],
          [
            '$eligible AND $monthly_income >= 5000 AND $credit_score >= 700',
            { decision: 'approved', card_type: 'gold', credit_limit: '200000', annual_fee: '2000' },
          ],
          [
            '$eligible AND $monthly_income >= 2500 AND $credit_score >= 650',
            { decision: 'approved', card_type: 'silver', credit_limit: '100000', annual_fee: '1000' },
          ],
          [
            '$eligible',
            { decision: 'approved', card_type: 'classic', credit_limit: '30000', annual_fee: '0' },
          ],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'credit_card_approval',
    category: 'financial',
    description: 'Credit card eligibility + tier assignment',
    tags: ['credit_card', 'approval'],
  },
  examples: [
    {
      name: 'platinum',
      inputs: { monthly_income: '15000', credit_score: 780, existing_cards: 1, age: 35 },
      expected: { decision: 'approved', card_type: 'platinum', credit_limit: '500000', annual_fee: '5000' },
    },
    {
      name: 'gold',
      inputs: { monthly_income: '6000', credit_score: 720, existing_cards: 2, age: 30 },
      expected: { decision: 'approved', card_type: 'gold', credit_limit: '200000', annual_fee: '2000' },
    },
    {
      name: 'rejected_underage',
      inputs: { monthly_income: '5000', credit_score: 700, existing_cards: 0, age: 19 },
      expected: { decision: 'rejected', card_type: 'none', credit_limit: '0', annual_fee: '0' },
    },
    {
      name: 'rejected_low_score',
      inputs: { monthly_income: '5000', credit_score: 550, existing_cards: 0, age: 30 },
      expected: { decision: 'rejected', card_type: 'none', credit_limit: '0', annual_fee: '0' },
    },
  ],
};

const PERFORMANCE_REVIEW: Template = {
  config: {
    name: 'performance_review',
    ver: '1.0.0',
    inputs: [
      { name: 'sales', type: 'num' },
      { name: 'quality', type: 'num' },
      { name: 'teamwork', type: 'num' },
      { name: 'leadership', type: 'num' },
    ],
    outputs: ['total_score', 'rating', 'bonus_pct'],
    blocks: [
      {
        id: 'calc_score',
        out: ['total_score', 'num'],
        expr: '($sales * 0.4) + ($quality * 0.3) + ($teamwork * 0.2) + ($leadership * 0.1)',
      },
      {
        id: 'rating',
        outs: [
          ['rating', 'str', 'unsatisfactory'],
          ['bonus_pct', 'num', 0],
        ],
        branches: [
          ['$total_score >= 90', { rating: 'excellent', bonus_pct: 20 }],
          ['$total_score >= 80', { rating: 'exceeds', bonus_pct: 15 }],
          ['$total_score >= 70', { rating: 'meets', bonus_pct: 10 }],
          ['$total_score >= 60', { rating: 'needs_improvement', bonus_pct: 5 }],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'performance_review',
    category: 'hr',
    description: 'Weighted performance scoring + rating + bonus',
    tags: ['hr', 'performance'],
  },
  examples: [
    {
      name: 'excellent',
      inputs: { sales: 95, quality: 90, teamwork: 90, leadership: 85 },
      expected: { total_score: 91.5, rating: 'excellent', bonus_pct: 20 },
    },
    {
      name: 'meets',
      inputs: { sales: 70, quality: 75, teamwork: 70, leadership: 65 },
      expected: { total_score: 71, rating: 'meets', bonus_pct: 10 },
    },
  ],
};

const INSURANCE_PREMIUM: Template = {
  config: {
    name: 'auto_insurance_premium',
    ver: '1.0.0',
    inputs: [
      { name: 'age', type: 'num', min: 18, max: 99 },
      { name: 'vehicle_class', type: 'str', enum: ['economy', 'sport', 'luxury', 'suv'] },
      { name: 'annual_mileage', type: 'num', min: 0, max: 100000 },
    ],
    outputs: ['base_rate', 'risk_factor', 'tier'],
    blocks: [
      {
        id: 'premium_table',
        table: ['$age', '$vehicle_class', '$annual_mileage'],
        outs: [
          ['base_rate', 'dec', '1500'],
          ['risk_factor', 'num', 1.2],
          ['tier', 'str', 'standard'],
        ],
        rows: [
          ['18..24', 'sport', '>20000', { base_rate: '3500', risk_factor: 2.5, tier: 'high_risk' }],
          ['18..24', 'sport', '*', { base_rate: '2800', risk_factor: 2, tier: 'high_risk' }],
          ['18..24', '*', '*', { base_rate: '1800', risk_factor: 1.5, tier: 'young' }],
          ['25..64', 'sport', '>20000', { base_rate: '2200', risk_factor: 1.6, tier: 'standard' }],
          ['25..64', 'luxury', '*', { base_rate: '2000', risk_factor: 1.4, tier: 'premium' }],
          ['25..64', '*', '0..15000', { base_rate: '1000', risk_factor: 0.9, tier: 'standard' }],
          ['25..64', '*', '*', { base_rate: '1300', risk_factor: 1, tier: 'standard' }],
          ['>=65', '*', '0..10000', { base_rate: '1100', risk_factor: 1.1, tier: 'senior' }],
          ['>=65', '*', '*', { base_rate: '1500', risk_factor: 1.4, tier: 'senior' }],
        ],
        default: {},
      },
    ],
  },
  meta: {
    name: 'auto_insurance_premium',
    category: 'insurance',
    description: 'Multi-dim auto insurance premium (age × vehicle × mileage)',
    tags: ['insurance', 'premium', 'table'],
  },
  examples: [
    {
      name: 'young_sport_high_mileage',
      inputs: { age: 22, vehicle_class: 'sport', annual_mileage: 25000 },
      expected: { base_rate: '3500', risk_factor: 2.5, tier: 'high_risk' },
    },
    {
      name: 'mid_age_luxury',
      inputs: { age: 28, vehicle_class: 'luxury', annual_mileage: 12000 },
      expected: { base_rate: '2000', risk_factor: 1.4, tier: 'premium' },
    },
    {
      name: 'senior_low_mileage',
      inputs: { age: 70, vehicle_class: 'economy', annual_mileage: 5000 },
      expected: { base_rate: '1100', risk_factor: 1.1, tier: 'senior' },
    },
  ],
};

const STUDENT_GRADING: Template = {
  config: {
    name: 'student_grading',
    ver: '1.0.0',
    inputs: [
      { name: 'midterm', type: 'num' },
      { name: 'final', type: 'num' },
      { name: 'assignment', type: 'num' },
      { name: 'attendance', type: 'num' },
    ],
    outputs: ['total_score', 'grade', 'gpa'],
    blocks: [
      {
        id: 'calc_total',
        out: ['total_score', 'num'],
        expr: '($midterm * 0.3) + ($final * 0.4) + ($assignment * 0.2) + ($attendance * 0.1)',
      },
      {
        id: 'grade',
        outs: [
          ['grade', 'str', 'F'],
          ['gpa', 'num', 0],
        ],
        branches: [
          ['$total_score >= 80', { grade: 'A', gpa: 4 }],
          ['$total_score >= 75', { grade: 'B+', gpa: 3.5 }],
          ['$total_score >= 70', { grade: 'B', gpa: 3 }],
          ['$total_score >= 65', { grade: 'C+', gpa: 2.5 }],
          ['$total_score >= 60', { grade: 'C', gpa: 2 }],
          ['$total_score >= 55', { grade: 'D+', gpa: 1.5 }],
          ['$total_score >= 50', { grade: 'D', gpa: 1 }],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'student_grading',
    category: 'education',
    description: 'Weighted student grading with letter grade + GPA',
    tags: ['student', 'grading'],
  },
  examples: [
    {
      name: 'A',
      inputs: { midterm: 85, final: 90, assignment: 80, attendance: 100 },
      expected: { total_score: 87.5, grade: 'A', gpa: 4 },
    },
    {
      name: 'C',
      inputs: { midterm: 60, final: 65, assignment: 60, attendance: 70 },
      expected: { total_score: 63, grade: 'C', gpa: 2 },
    },
  ],
};

const PROPERTY_VALUATION: Template = {
  config: {
    name: 'property_valuation',
    ver: '1.0.0',
    inputs: [
      { name: 'base_price_per_sqm', type: 'dec' },
      { name: 'area_sqm', type: 'num' },
      { name: 'location_grade', type: 'str' },
      { name: 'age_years', type: 'num' },
    ],
    outputs: ['gross_value', 'location_factor', 'depreciation_pct', 'final_value'],
    blocks: [
      {
        id: 'gross',
        out: ['gross_value', 'dec'],
        expr: '$base_price_per_sqm * $area_sqm',
      },
      {
        id: 'location',
        on: '$location_grade',
        outs: [['location_factor', 'num', 1]],
        cases: [
          ['prime', { location_factor: 1.5 }],
          ['good', { location_factor: 1.2 }],
          ['standard', { location_factor: 1 }],
          ['suburban', { location_factor: 0.85 }],
        ],
        default: {},
      },
      {
        id: 'depreciation',
        outs: [['depreciation_pct', 'num', 0]],
        branches: [
          ['$age_years <= 5', { depreciation_pct: 0 }],
          ['$age_years <= 10', { depreciation_pct: 5 }],
          ['$age_years <= 20', { depreciation_pct: 15 }],
          ['$age_years <= 30', { depreciation_pct: 25 }],
        ],
        else: { depreciation_pct: 40 },
      },
      {
        id: 'final',
        out: ['final_value', 'dec'],
        expr: 'currency_round($gross_value * $location_factor * (100 - $depreciation_pct) / 100)',
      },
    ],
  },
  meta: {
    name: 'property_valuation',
    category: 'real_estate',
    description: 'Property value: base × area × location × depreciation',
    tags: ['real_estate', 'valuation'],
  },
  examples: [
    {
      name: 'new_prime',
      inputs: { base_price_per_sqm: '50000', area_sqm: 100, location_grade: 'prime', age_years: 2 },
      expected: { gross_value: '5000000', location_factor: 1.5, depreciation_pct: 0, final_value: '7500000' },
    },
    {
      name: 'old_suburban',
      inputs: { base_price_per_sqm: '20000', area_sqm: 80, location_grade: 'suburban', age_years: 35 },
      expected: { gross_value: '1600000', location_factor: 0.85, depreciation_pct: 40, final_value: '816000' },
    },
  ],
};

const EMPLOYEE_LEAVE: Template = {
  config: {
    name: 'employee_leave_request',
    ver: '1.0.0',
    uses: ['date'],
    inputs: [
      { name: 'leave_start', type: 'date' },
      { name: 'leave_end', type: 'date' },
      { name: 'accrued_days', type: 'num', min: 0 },
      { name: 'tier', type: 'str', enum: ['junior', 'senior', 'lead'] },
    ],
    outputs: ['total_days', 'business_days', 'within_balance', 'auto_approved', 'return_date'],
    blocks: [
      { id: 'count_total', out: ['total_days', 'num'], expr: 'days_between($leave_start, $leave_end) + 1' },
      { id: 'count_business', out: ['business_days', 'num'], expr: 'business_days_between($leave_start, $leave_end) + 1' },
      { id: 'check_balance', out: ['within_balance', 'bool'], expr: '$accrued_days >= $business_days' },
      {
        id: 'approval',
        on: '$tier',
        outs: [['auto_approved', 'bool', false]],
        cases: [
          ['lead', { auto_approved: '$within_balance' }],
          ['senior', { auto_approved: '$within_balance AND $business_days <= 5' }],
          ['junior', { auto_approved: '$within_balance AND $business_days <= 3' }],
        ],
        default: {},
      },
      { id: 'return', out: ['return_date', 'date'], expr: 'add_days($leave_end, 1)' },
    ],
  },
  meta: {
    name: 'employee_leave_request',
    category: 'hr',
    description: 'leave request: counts business days, checks balance, auto-approves by tier',
    tags: ['leave', 'hr', 'date'],
  },
  examples: [
    {
      name: 'senior_within_balance',
      inputs: { leave_start: '2026-06-01', leave_end: '2026-06-05', accrued_days: 10, tier: 'senior' },
      expected: { total_days: 5, business_days: 5, within_balance: true, auto_approved: true, return_date: '2026-06-06' },
    },
    {
      name: 'junior_too_long',
      inputs: { leave_start: '2026-06-01', leave_end: '2026-06-05', accrued_days: 10, tier: 'junior' },
      expected: { total_days: 5, business_days: 5, within_balance: true, auto_approved: false, return_date: '2026-06-06' },
    },
    {
      name: 'over_balance',
      inputs: { leave_start: '2026-12-21', leave_end: '2026-12-25', accrued_days: 2, tier: 'senior' },
      expected: { total_days: 5, business_days: 5, within_balance: false, auto_approved: false, return_date: '2026-12-26' },
    },
  ],
};

const SUPPORT_SLA: Template = {
  config: {
    name: 'support_ticket_sla',
    ver: '1.0.0',
    uses: ['date'],
    inputs: [
      { name: 'submitted_at', type: 'datetime' },
      { name: 'priority', type: 'str', enum: ['critical', 'high', 'normal', 'low'] },
    ],
    outputs: ['sla_hours', 'due_at', 'in_business_hours', 'response_channel'],
    blocks: [
      {
        id: 'pick_sla',
        on: '$priority',
        outs: [['sla_hours', 'num', 72]],
        cases: [
          ['critical', { sla_hours: 1 }],
          ['high', { sla_hours: 4 }],
          ['normal', { sla_hours: 24 }],
          ['low', { sla_hours: 72 }],
        ],
        default: {},
      },
      { id: 'compute_due', out: ['due_at', 'datetime'], expr: 'add_hours($submitted_at, $sla_hours)' },
      { id: 'extract_time', out: ['submit_time', 'time'], expr: 'time_of($submitted_at)' },
      {
        id: 'check_hours',
        out: ['in_business_hours', 'bool'],
        expr: 'is_business_hours($submit_time, "09:00:00", "17:00:00")',
      },
      {
        id: 'route',
        outs: [['response_channel', 'str', 'email_queue']],
        branches: [
          ['$priority == "critical"', { response_channel: 'pager' }],
          ['$in_business_hours AND $priority == "high"', { response_channel: 'live_chat' }],
          ['$in_business_hours', { response_channel: 'agent_inbox' }],
        ],
        else: {},
      },
    ],
  },
  meta: {
    name: 'support_ticket_sla',
    category: 'support',
    description: 'support SLA: due time + business-hours routing by priority',
    tags: ['sla', 'support', 'datetime', 'time'],
  },
  examples: [
    {
      name: 'high_in_hours',
      inputs: { submitted_at: '2026-05-04T10:30:00Z', priority: 'high' },
      expected: {
        sla_hours: 4,
        due_at: '2026-05-04T14:30:00Z',
        in_business_hours: true,
        response_channel: 'live_chat',
      },
    },
    {
      name: 'critical_after_hours',
      inputs: { submitted_at: '2026-05-04T22:15:00Z', priority: 'critical' },
      expected: {
        sla_hours: 1,
        due_at: '2026-05-04T23:15:00Z',
        in_business_hours: false,
        response_channel: 'pager',
      },
    },
    {
      name: 'low_after_hours',
      inputs: { submitted_at: '2026-05-04T20:00:00Z', priority: 'low' },
      expected: {
        sla_hours: 72,
        due_at: '2026-05-07T20:00:00Z',
        in_business_hours: false,
        response_channel: 'email_queue',
      },
    },
  ],
};

const BUILTIN: Record<string, Template> = {
  loan_approval: LOAN_APPROVAL,
  credit_card_approval: CREDIT_CARD_APPROVAL,
  bmi_assessment: BMI_ASSESSMENT,
  tier_pricing: TIER_PRICING,
  performance_review: PERFORMANCE_REVIEW,
  auto_insurance_premium: INSURANCE_PREMIUM,
  student_grading: STUDENT_GRADING,
  property_valuation: PROPERTY_VALUATION,
  employee_leave_request: EMPLOYEE_LEAVE,
  support_ticket_sla: SUPPORT_SLA,
};

export class TemplateRegistry {
  private templates = new Map<string, Template>(Object.entries(BUILTIN));

  list(category?: string): TemplateMeta[] {
    const out: TemplateMeta[] = [];
    for (const t of this.templates.values()) {
      if (!category || t.meta.category === category) out.push(t.meta);
    }
    return out;
  }

  get(name: string): Template | undefined {
    return this.templates.get(name);
  }

  search(keyword: string): TemplateMeta[] {
    const k = keyword.toLowerCase();
    const out: TemplateMeta[] = [];
    for (const t of this.templates.values()) {
      if (
        t.meta.name.toLowerCase().includes(k) ||
        t.meta.description.toLowerCase().includes(k) ||
        t.meta.tags.some((tag) => tag.toLowerCase().includes(k))
      ) {
        out.push(t.meta);
      }
    }
    return out;
  }

  register(name: string, template: Template): void {
    this.templates.set(name, template);
  }

  exportJson(name: string): string {
    const t = this.templates.get(name);
    if (!t) throw new Error(`template '${name}' not found`);
    return JSON.stringify(t);
  }

  importJson(json: string): string {
    const t = JSON.parse(json) as Template;
    if (!t.config || !t.meta || !Array.isArray(t.examples)) {
      throw new Error('invalid template JSON');
    }
    this.register(t.meta.name, t);
    return t.meta.name;
  }

  categories(): string[] {
    const out = new Set<string>();
    for (const t of this.templates.values()) out.add(t.meta.category);
    return Array.from(out);
  }
}
