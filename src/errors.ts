export interface ErrLoc {
  block?: string;
  field?: string;
  path?: string;
}

export class ConfigError extends Error {
  code: string;
  rawMessage: string;
  loc?: ErrLoc;
  expected?: unknown;
  got?: unknown;

  constructor(code: string, message: string, opts?: { loc?: ErrLoc; expected?: unknown; got?: unknown }) {
    super(`${code}: ${message}`);
    this.name = 'ConfigError';
    this.code = code;
    this.rawMessage = message;
    this.loc = opts?.loc;
    this.expected = opts?.expected;
    this.got = opts?.got;
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
  detail?: unknown;

  constructor(code: string, message: string, opts?: { loc?: ErrLoc; detail?: unknown }) {
    super(`${code}: ${message}`);
    this.name = 'RunError';
    this.code = code;
    this.loc = opts?.loc;
    this.detail = opts?.detail;
  }
}

export class Warning {
  code: string;
  loc?: ErrLoc;
  message: string;
  severity: 'info' | 'warning';

  constructor(code: string, message: string, severity: 'info' | 'warning', loc?: ErrLoc) {
    this.code = code;
    this.message = message;
    this.severity = severity;
    this.loc = loc;
  }
}
