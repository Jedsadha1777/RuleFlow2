export type PrimType = 'num' | 'dec' | 'str' | 'bool' | 'date' | 'time' | 'datetime' | 'null';

export interface Module {
  name: string;
  ver: string;
  uses?: string[];
  inputs: InputDecl[];
  outputs: string[];
  blocks: Block[];
  meta?: Record<string, unknown>;
}

export interface InputDecl {
  name: string;
  type: PrimType;
  nullable?: boolean;
  enum?: string[];
  min?: number | string;
  max?: number | string;
}

export type Block = FormulaBlock | IfBlock | SwitchBlock | TableBlock;

export interface FormulaBlock {
  id: string;
  out: [string, PrimType];
  expr: string;
}

export interface IfBlock {
  id: string;
  outs: OutDecl[];
  branches: Branch[];
  else: Payload;
}

export interface SwitchBlock {
  id: string;
  on: string;
  outs: OutDecl[];
  cases: Case[];
  default: Payload;
}

export interface TableBlock {
  id: string;
  table: string[];
  outs: OutDecl[];
  rows: Row[];
  default: Payload;
}

export type OutDecl = [string, PrimType, FallbackValue];
export type FallbackValue = number | string | boolean | null;

export type Branch = [string, Payload];
export type Case = [FallbackValue, Payload];
export type Row = (FallbackValue | string | Payload)[];

export type Payload = SetMap | Block[];
export type SetMap = Record<string, ValueOrExpr>;
export type ValueOrExpr = number | string | boolean | null;

export type Outputs = Record<string, unknown>;
export type Inputs = Record<string, unknown>;

export type AstNode =
  | LitNode
  | VarNode
  | BinNode
  | UnNode
  | CmpNode
  | LogicNode
  | CallNode;

export interface Loc {
  start: number;
  end: number;
}

export interface LitNode {
  k: 'lit';
  type: PrimType;
  value: unknown;
  loc: Loc;
}

export interface VarNode {
  k: 'var';
  name: string;
  loc: Loc;
}

export interface BinNode {
  k: 'bin';
  op: '+' | '-' | '*' | '/' | '%' | '**';
  left: AstNode;
  right: AstNode;
  loc: Loc;
}

export interface UnNode {
  k: 'un';
  op: '-' | '!';
  operand: AstNode;
  loc: Loc;
}

export interface CmpNode {
  k: 'cmp';
  op: '==' | '!=' | '>' | '<' | '>=' | '<=';
  left: AstNode;
  right: AstNode;
  loc: Loc;
}

export interface LogicNode {
  k: 'logic';
  op: 'AND' | 'OR' | 'NOT';
  operands: AstNode[];
  loc: Loc;
}

export interface CallNode {
  k: 'call';
  name: string;
  args: AstNode[];
  loc: Loc;
}

export type FnImpl = (...args: unknown[]) => unknown;

export interface FnSig {
  name: string;
  theme: string;
  args: ArgSpec[];
  return: PrimType;
  variadic?: boolean;
  desc?: string;
}

export interface ArgSpec {
  name: string;
  type: PrimType | PrimType[];
  optional?: boolean;
  default?: unknown;
}

export interface Manifest {
  name: string;
  ver: string;
  desc?: string;
  funcs: FnSig[];
  impl?: Record<string, string>;
}

export interface ConfigErrorObj {
  code: string;
  loc?: { block?: string; field?: string; path?: string };
  message: string;
  expected?: unknown;
  got?: unknown;
}

export interface WarningObj {
  code: string;
  loc?: { block?: string; field?: string; path?: string };
  message: string;
  severity: 'info' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ConfigErrorObj[];
  warnings: WarningObj[];
  meta: { total_blocks: number; required_inputs: string[] };
}

export type CellPattern =
  | { k: 'wildcard' }
  | { k: 'literal'; value: unknown }
  | { k: 'cmp'; op: '>' | '<' | '>=' | '<=' | '!='; value: number }
  | { k: 'range'; lo: number; hi: number };

export interface PreparedFormula {
  kind: 'formula';
  id: string;
  outName: string;
  outType: PrimType;
  expr: AstNode;
}

export interface PreparedIf {
  kind: 'if';
  id: string;
  outs: PreparedOut[];
  branches: PreparedBranch[];
  else: PreparedPayload;
}

export interface PreparedSwitch {
  kind: 'switch';
  id: string;
  on: string;
  outs: PreparedOut[];
  cases: PreparedCase[];
  default: PreparedPayload;
}

export interface PreparedTable {
  kind: 'table';
  id: string;
  table: string[];
  outs: PreparedOut[];
  rows: PreparedRow[];
  default: PreparedPayload;
}

export type PreparedBlock = PreparedFormula | PreparedIf | PreparedSwitch | PreparedTable;

export interface PreparedOut {
  name: string;
  type: PrimType;
  fallback: unknown;
}

export interface PreparedBranch {
  cond: AstNode;
  payload: PreparedPayload;
}

export interface PreparedCase {
  value: unknown;
  payload: PreparedPayload;
}

export interface PreparedRow {
  cells: CellPattern[];
  payload: PreparedPayload;
}

export type PreparedPayload =
  | { kind: 'set'; entries: PreparedSetEntry[] }
  | { kind: 'blocks'; blocks: PreparedBlock[] };

export interface PreparedSetEntry {
  output: string;
  type: PrimType;
  value: PreparedValue;
}

export type PreparedValue =
  | { kind: 'literal'; value: unknown }
  | { kind: 'expr'; ast: AstNode };

export interface PreparedModule {
  module: Module;
  order: PreparedBlock[];
}
