export interface ErrLoc {
  block?: string;
  field?: string;
  path?: string;
}

export class ConfigError extends Error {
  code: string;
  rawMessage: string;
  loc?: ErrLoc;

  constructor(code: string, message: string, opts?: { loc?: ErrLoc }) {
    super(`${code}: ${message}`);
    this.name = 'ConfigError';
    this.code = code;
    this.rawMessage = message;
    this.loc = opts?.loc;
  }
}

export class InputError extends Error {
  code: string;
  input: string;
  expected?: unknown;
  got?: unknown;

  constructor(code: string, input: string, message: string, opts?: { expected?: unknown; got?: unknown }) {
    super(`${code} [${input}]: ${message}`);
    this.name = 'InputError';
    this.code = code;
    this.input = input;
    this.expected = opts?.expected;
    this.got = opts?.got;
  }
}

export class RunError extends Error {
  code: string;
  loc?: ErrLoc;

  constructor(code: string, message: string, opts?: { loc?: ErrLoc }) {
    super(`${code}: ${message}`);
    this.name = 'RunError';
    this.code = code;
    this.loc = opts?.loc;
  }
}
