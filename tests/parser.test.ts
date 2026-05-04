import { describe, expect, it } from 'vitest';
import { collectFuncCalls, collectVarRefs, parseCellPattern, parseExpr, tokenize, walkAst } from '../src/parser.js';
import type { AstNode, BinNode, CallNode, CmpNode, LitNode, LogicNode, UnNode, VarNode } from '../src/types.js';

describe('tokenizer', () => {
  it('numbers', () => {
    const t = tokenize('25 3.14 0.5');
    expect(t.filter((x) => x.kind === 'num').map((x) => x.value)).toEqual([25, 3.14, 0.5]);
  });

  it('strings (single/double quote, escapes)', () => {
    expect(tokenize("'hello'")[0]).toMatchObject({ kind: 'str', value: 'hello' });
    expect(tokenize('"world"')[0]).toMatchObject({ kind: 'str', value: 'world' });
    expect(tokenize("'it\\'s'")[0]).toMatchObject({ kind: 'str', value: "it's" });
    expect(tokenize("'a\\nb'")[0]).toMatchObject({ kind: 'str', value: 'a\nb' });
  });

  it('var case-sensitive', () => {
    expect(tokenize('$age')[0]).toMatchObject({ kind: 'var', value: 'age' });
    expect(tokenize('$Age')[0]).toMatchObject({ kind: 'var', value: 'Age' });
    expect(tokenize('$a_1_b')[0]).toMatchObject({ kind: 'var', value: 'a_1_b' });
  });

  it('keywords', () => {
    expect(tokenize('true false null')[0]).toMatchObject({ kind: 'bool', value: true });
    expect(tokenize('AND or NoT').map((t) => t.value)).toContain('AND');
    expect(tokenize('AND or NoT').map((t) => t.value)).toContain('OR');
    expect(tokenize('AND or NoT').map((t) => t.value)).toContain('NOT');
  });

  it('operators', () => {
    const ops = tokenize('+ - * / % ** > < >= <= == !=').filter((t) => t.kind === 'op').map((t) => t.value);
    expect(ops).toEqual(['+', '-', '*', '/', '%', '**', '>', '<', '>=', '<=', '==', '!=']);
  });

  it('throws on bad input', () => {
    expect(() => tokenize('@')).toThrow();
    expect(() => tokenize("'unterminated")).toThrow();
    expect(() => tokenize('$1bad')).toThrow();
  });
});

describe('parser', () => {
  const lit = (n: AstNode) => n as LitNode;
  const v = (n: AstNode) => n as VarNode;
  const bin = (n: AstNode) => n as BinNode;
  const cmp = (n: AstNode) => n as CmpNode;
  const lg = (n: AstNode) => n as LogicNode;
  const un = (n: AstNode) => n as UnNode;
  const call = (n: AstNode) => n as CallNode;

  it('literals', () => {
    expect(lit(parseExpr('25')).value).toBe(25);
    expect(lit(parseExpr("'hello'")).value).toBe('hello');
    expect(lit(parseExpr('true')).value).toBe(true);
    expect(lit(parseExpr('null')).value).toBe(null);
  });

  it('var ref', () => {
    expect(v(parseExpr('$x')).name).toBe('x');
  });

  it('binary precedence: 1+2*3 => 1+(2*3)', () => {
    const a = bin(parseExpr('1 + 2 * 3'));
    expect(a.op).toBe('+');
    expect(bin(a.right).op).toBe('*');
  });

  it('parens override', () => {
    const a = bin(parseExpr('(1 + 2) * 3'));
    expect(a.op).toBe('*');
  });

  it('comparison', () => {
    expect(cmp(parseExpr('$x >= 80')).op).toBe('>=');
  });

  it('AND chained flattens', () => {
    const a = lg(parseExpr('$a AND $b AND $c'));
    expect(a.op).toBe('AND');
    expect(a.operands).toHaveLength(3);
  });

  it('NOT lower prec than compare', () => {
    const a = lg(parseExpr('NOT $x > 5'));
    expect(a.op).toBe('NOT');
    expect(cmp(a.operands[0]).op).toBe('>');
  });

  it('** is right-associative', () => {
    const a = bin(parseExpr('2 ** 3 ** 2'));
    expect(a.op).toBe('**');
    expect(lit(a.left).value).toBe(2);
    expect(bin(a.right).op).toBe('**');
  });

  it('unary minus', () => {
    expect(un(parseExpr('-5')).op).toBe('-');
  });

  it('function call', () => {
    const a = call(parseExpr('between($x, 1, 10)'));
    expect(a.name).toBe('between');
    expect(a.args).toHaveLength(3);
  });

  it('nested function call', () => {
    const a = call(parseExpr('round(sqrt($x), 2)'));
    expect(a.name).toBe('round');
    expect(call(a.args[0]).name).toBe('sqrt');
  });

  it('rejects bare identifier', () => {
    expect(() => parseExpr('foo')).toThrow();
  });

  it('walkAst visits all nodes', () => {
    const ast = parseExpr('$a + $b * fn($c)');
    const seen: string[] = [];
    walkAst(ast, (n) => seen.push(n.k));
    expect(seen).toContain('var');
    expect(seen).toContain('call');
    expect(seen).toContain('bin');
  });

  it('collectVarRefs', () => {
    const refs = collectVarRefs(parseExpr('$a + $b * fn($c, $a)'));
    expect(Array.from(refs).sort()).toEqual(['a', 'b', 'c']);
  });

  it('collectFuncCalls', () => {
    const calls = collectFuncCalls(parseExpr('round(sqrt($x), 2) + abs($y)'));
    expect(Array.from(calls).sort()).toEqual(['abs', 'round', 'sqrt']);
  });
});

describe('parseCellPattern', () => {
  it('wildcard', () => {
    expect(parseCellPattern('*')).toEqual({ k: 'wildcard' });
  });

  it('range', () => {
    expect(parseCellPattern('5..10')).toEqual({ k: 'range', lo: 5, hi: 10 });
    expect(parseCellPattern('-5..5')).toEqual({ k: 'range', lo: -5, hi: 5 });
    expect(parseCellPattern('1.5..2.5')).toEqual({ k: 'range', lo: 1.5, hi: 2.5 });
  });

  it('comparison', () => {
    expect(parseCellPattern('>5')).toEqual({ k: 'cmp', op: '>', value: 5 });
    expect(parseCellPattern('>=10')).toEqual({ k: 'cmp', op: '>=', value: 10 });
    expect(parseCellPattern('<3')).toEqual({ k: 'cmp', op: '<', value: 3 });
    expect(parseCellPattern('<=3.5')).toEqual({ k: 'cmp', op: '<=', value: 3.5 });
    expect(parseCellPattern('!=0')).toEqual({ k: 'cmp', op: '!=', value: 0 });
    expect(parseCellPattern('>-5')).toEqual({ k: 'cmp', op: '>', value: -5 });
  });

  it('literals', () => {
    expect(parseCellPattern('gold')).toEqual({ k: 'literal', value: 'gold' });
    expect(parseCellPattern(15)).toEqual({ k: 'literal', value: 15 });
    expect(parseCellPattern(true)).toEqual({ k: 'literal', value: true });
    expect(parseCellPattern('-7')).toEqual({ k: 'literal', value: -7 });
  });
});
