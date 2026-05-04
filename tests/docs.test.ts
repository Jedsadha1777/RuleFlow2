import { describe, expect, it } from 'vitest';
import { RuleFlow } from '../src/index.js';
import type { Module } from '../src/index.js';

const rf = new RuleFlow();

const m: Module = {
  name: 'sample',
  ver: '2.1.0',
  inputs: [
    { name: 'price', type: 'dec' },
    { name: 'qty', type: 'num', min: 1 },
    { name: 'tier', type: 'str', enum: ['a', 'b'] },
  ],
  outputs: ['total', 'discount'],
  meta: { description: 'Sample module for docs test' },
  blocks: [
    { id: 'sub', out: ['subtotal', 'dec'], expr: '$price * $qty' },
    {
      id: 'disc',
      on: '$tier',
      outs: [['discount', 'num', 0]],
      cases: [
        ['a', { discount: 10 }],
        ['b', { discount: 5 }],
      ],
      default: {},
    },
    { id: 'tot', out: ['total', 'dec'], expr: '$subtotal' },
  ],
};

describe('generateDocs', () => {
  it('produces markdown with header', () => {
    const doc = rf.generateDocs(m);
    expect(doc).toContain('# sample (v2.1.0)');
    expect(doc).toContain('Sample module for docs test');
  });

  it('lists inputs with constraints', () => {
    const doc = rf.generateDocs(m);
    expect(doc).toContain('## Inputs');
    expect(doc).toContain('| `price` | dec | yes');
    expect(doc).toContain('| `qty` | num | yes | min: 1 |');
    expect(doc).toContain('enum: a, b');
  });

  it('lists outputs', () => {
    const doc = rf.generateDocs(m);
    expect(doc).toContain('## Outputs');
    expect(doc).toContain('- `total`');
    expect(doc).toContain('- `discount`');
  });

  it('describes each block', () => {
    const doc = rf.generateDocs(m);
    expect(doc).toContain('### `sub` (formula)');
    expect(doc).toContain('Output: `subtotal` (dec)');
    expect(doc).toContain('### `disc` (switch)');
    expect(doc).toContain('On: `$tier`');
    expect(doc).toContain('case `a`');
  });
});
