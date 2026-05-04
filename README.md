# RuleFlow2

Declarative business-rule engine for TypeScript. AST-parsed expressions, no regex, no eval.

## Install

```bash
npm install
```

## Quick start

```ts
import { RuleFlow } from 'ruleflow2';
import type { Module } from 'ruleflow2';

const config: Module = {
  name: 'order_total',
  ver: '1.0.0',
  uses: ['money'],
  inputs: [
    { name: 'price', type: 'dec' },
    { name: 'qty', type: 'num' },
    { name: 'tax_rate', type: 'num' },
  ],
  outputs: ['total'],
  blocks: [
    { id: 'sub', out: ['subtotal', 'dec'], expr: '$price * $qty' },
    { id: 'tx', out: ['tax', 'dec'], expr: '$subtotal * $tax_rate / 100' },
    { id: 'tot', out: ['total', 'dec'], expr: 'currency_round($subtotal + $tax)' },
  ],
};

const rf = new RuleFlow();
const result = rf.evaluate(config, { price: '100', qty: 3, tax_rate: 7 });
// { total: '321' }
```

## Block types

```ts
// Formula — single output, expression
{ id: 'b', out: ['name', 'num'], expr: '$x * 2' }

// If/Elif/Else — multi-output + fallback
{
  id: 'b',
  outs: [['grade', 'str', 'F']],
  branches: [
    ['$score >= 80', { grade: 'A' }],
    ['$score >= 70', { grade: 'B' }],
  ],
  else: {},
}

// Switch — equality match
{
  id: 'b',
  on: '$tier',
  outs: [['discount', 'num', 0]],
  cases: [
    ['gold', { discount: 15 }],
    ['silver', { discount: 10 }],
  ],
  default: {},
}

// Table — multi-dim with wildcard / range / comparison
{
  id: 'b',
  table: ['$tier', '$qty'],
  outs: [['discount', 'num', 0]],
  rows: [
    ['gold', '>=100', { discount: 25 }],
    ['gold', '*',     { discount: 15 }],
    ['*',    '5..50', { discount: 10 }],
  ],
  default: {},
}
```

## Types

`num` `dec` `str` `bool` `date` `time` `datetime`

## Constraints on inputs

```ts
{ name: 'age', type: 'num', min: 18, max: 120 }
{ name: 'tier', type: 'str', enum: ['gold', 'silver'] }
{ name: 'note', type: 'str', nullable: true }
```

## Themes

Default loaded: `math`, `logic`, `conv`. On-demand: `date`, `str`, `money`.

```ts
rf.loadTheme('date');
// or specify in module
const config = { uses: ['date', 'money'], ... };
```

## Cached evaluation

```ts
const handle = rf.prepare(config);
const r1 = rf.evaluatePrepared(handle, inputs1);
const r2 = rf.evaluatePrepared(handle, inputs2);
```

## Batch

```ts
const results = rf.evaluateBatch(config, [inputs1, inputs2, inputs3]);
```

## Validation

```ts
const result = rf.validate(config);
// { valid, errors, warnings, meta }

const fr = rf.validateField('age', 25, config);
const partial = rf.validatePartial({ age: 25 }, config);
const status = rf.validationStatus(inputs, config);
```

## Live preview

```ts
const preview = rf.livePreview(inputs, config);
// { outputs?, missing_required, ready }
```

## Field suggestions

```ts
const opts = rf.fieldSuggestions('tier', config);
// ['gold', 'silver', 'bronze']
```

## UI editor helpers

```ts
// Variables + functions visible at a given block (for autocomplete / scope check)
const scope = rf.scopeAt(config, 'block_id');
// { vars: ['price', 'qty', 'subtotal'], functions: ['min', 'max', ...] }

// Validate a single block without running the whole module
const r = rf.validateBlock(block, scope);
// { valid, errors, warnings }

// Sandbox eval of an expression with sample vars
const p = rf.previewExpr('$x * 2 + 1', { x: 5 });
// { result: 11 } or { error: '...' }

// Non-throwing parse for live editor
const r = rf.tryParseExpr('$x +');
// { ast?, error?: { code, message, pos } }

// Autocomplete at cursor position
const c = rf.completionAt('$pri', 4, scope);
// { kind: 'var', prefix: 'pri', suggestions: ['price'] }
```

## Debug trace

```ts
const r = rf.debug(config, inputs);
// { result, trace: { order, intermediate, timing_us, total_us } }
```

## Code generation

```ts
const code = rf.generateCode(config, { function_name: 'evaluate' });
// emits TypeScript function
```

## Schema generation

```ts
rf.generateSchema(config, 'json-schema');
rf.generateSchema(config, 'openapi');
rf.generateSchema(config, 'typescript');
rf.generateSchema(config, 'html-form');
rf.generateSchema(config, 'react');
rf.generateSchema(config, 'joi');
rf.generateSchema(config, 'yup');
rf.generateSchema(config, 'laravel');
```

## Docs generation

```ts
const md = rf.generateDocs(config);
```

## Custom function pack

```ts
rf.addPack(
  {
    name: 'thai_locale',
    ver: '1.0.0',
    funcs: [
      { name: 'thai_vat', theme: 'thai', args: [{ name: 'amount', type: 'dec' }], return: 'dec' },
    ],
  },
  { thai_vat: (amount) => Number(amount) * 0.07 }
);
```

## Templates

```ts
rf.getTemplates();                      // list all
rf.getTemplates('financial');           // filter by category
rf.getTemplate('loan_approval');        // get one
rf.searchTemplates('loan');             // search
rf.evaluateTemplate('bmi_assessment', { weight: '70', height: '1.75' });
rf.testTemplate('bmi_assessment', 0);   // run example
rf.exportTemplate('bmi_assessment');    // → JSON
rf.importTemplate(json);                // load custom
```

Built-in templates: `loan_approval`, `credit_card_approval`, `bmi_assessment`, `tier_pricing`, `performance_review`, `auto_insurance_premium`, `student_grading`, `property_valuation`.

## Expression syntax

```
$var              variable reference
+ - * / % **      math
> < >= <= == !=   comparison
AND OR NOT        logic (case-insensitive)
fn(a, b)          function call
'text' "text"     string literal
true false null   literals
( )               grouping
```

Forbidden inside expressions: `IF()`, `SWITCH()`, ternary `?:` — use Block-level branching.

## Browser bundle

```bash
npm run ui:bundle     # build IIFE bundle → ui/dist/ruleflow2.js
npm run ui:watch      # rebuild on src/ change
```

```html
<script src="ruleflow2.js"></script>
<script>
  const rf = new RuleFlow2.RuleFlow();
  const result = rf.evaluate(config, inputs);
</script>
```

Bundle exposes everything from `src/index.ts` under `window.RuleFlow2` namespace (~170KB, includes decimal.js-light).

## Playground UI

```bash
npm run ui:bundle     # build engine bundle (one time)
npm run ui:serve      # serve at http://localhost:5173
```

Visual editor (jQuery + Bootstrap) under `ui/`:
- Add Formula / If / Switch / Table blocks
- Live JSON preview
- Form auto-generated from inputs (live preview output)
- Expression autocomplete (vars + functions)
- Inline parse + scope error
- Bottom tabs: Errors / Debug / Code / Schema / Docs
- Templates browser
- Import / Export JSON

## Scripts

```bash
npm test              # run all tests
npm run test:watch    # watch mode
npm run typecheck     # tsc --noEmit
npm run ui:bundle     # build engine for browser
npm run ui:watch      # rebuild on change
npm run ui:serve      # serve playground
```
