import Decimal from 'decimal.js-light';
import type { FnImpl, FnSig, Manifest } from './types.js';
import { ConfigError, RunError } from './errors.js';
import {
  formatDate,
  formatDateTime,
  formatTime,
  parseDate,
  parseDateTime,
  parseTime,
  weekdayMondayBased,
  type DateParts,
  type DateTimeParts,
  type TimeParts,
} from './util.js';

export interface FnEntry {
  sig: FnSig;
  impl: FnImpl;
}

export class FunctionRegistry {
  private fns = new Map<string, FnEntry>();
  private themesLoaded = new Set<string>();

  register(sig: FnSig, impl: FnImpl): void {
    if (this.fns.has(sig.name)) {
      throw new ConfigError('S7_DUPLICATE_FUNC', `function '${sig.name}' already registered`);
    }
    this.fns.set(sig.name, { sig, impl });
  }

  get(name: string): FnEntry | undefined {
    return this.fns.get(name);
  }

  has(name: string): boolean {
    return this.fns.has(name);
  }

  list(): FnSig[] {
    return Array.from(this.fns.values()).map((e) => e.sig);
  }

  loadTheme(name: ThemeName): void {
    if (this.themesLoaded.has(name)) return;
    const theme = THEMES[name];
    if (!theme) throw new ConfigError('S7_UNKNOWN_THEME', `unknown theme '${name}'`);
    for (const sig of theme.sigs) {
      const impl = theme.impl[sig.name];
      if (!impl) {
        throw new ConfigError('S7_IMPL_MISSING', `theme '${name}' missing impl for '${sig.name}'`);
      }
      this.register(sig, impl);
    }
    this.themesLoaded.add(name);
  }

  isThemeLoaded(name: string): boolean {
    return this.themesLoaded.has(name);
  }

  loadedThemes(): string[] {
    return Array.from(this.themesLoaded);
  }

  addPack(manifest: Manifest, impls: Record<string, FnImpl>): void {
    for (const sig of manifest.funcs) {
      const impl = impls[sig.name];
      if (!impl) {
        throw new ConfigError('S7_IMPL_MISSING', `pack '${manifest.name}' missing impl for '${sig.name}'`);
      }
      this.register(sig, impl);
    }
  }
}

const isDec = (v: unknown): v is Decimal => v instanceof Decimal;
const toDec = (v: unknown): Decimal => (isDec(v) ? v : new Decimal(v as string | number));
const preserveType = (input: unknown, result: Decimal): unknown =>
  isDec(input) ? result : result.toNumber();

const MATH_SIGS: FnSig[] = [
  { name: 'abs', theme: 'math', args: [{ name: 'x', type: ['num', 'dec'] }], return: 'num' },
  { name: 'min', theme: 'math', args: [{ name: 'a', type: ['num', 'dec'] }], return: 'num', variadic: true },
  { name: 'max', theme: 'math', args: [{ name: 'a', type: ['num', 'dec'] }], return: 'num', variadic: true },
  {
    name: 'round',
    theme: 'math',
    args: [
      { name: 'x', type: 'dec' },
      { name: 'digits', type: 'num', optional: true, default: 0 },
    ],
    return: 'dec',
  },
  { name: 'ceil', theme: 'math', args: [{ name: 'x', type: 'dec' }], return: 'dec' },
  { name: 'floor', theme: 'math', args: [{ name: 'x', type: 'dec' }], return: 'dec' },
  { name: 'sqrt', theme: 'math', args: [{ name: 'x', type: 'num' }], return: 'num' },
  {
    name: 'pow',
    theme: 'math',
    args: [
      { name: 'base', type: 'num' },
      { name: 'exp', type: 'num' },
    ],
    return: 'num',
  },
  {
    name: 'percent',
    theme: 'math',
    args: [
      { name: 'part', type: ['num', 'dec'] },
      { name: 'whole', type: ['num', 'dec'] },
    ],
    return: 'dec',
  },
  {
    name: 'clamp',
    theme: 'math',
    args: [
      { name: 'x', type: 'num' },
      { name: 'lo', type: 'num' },
      { name: 'hi', type: 'num' },
    ],
    return: 'num',
  },
  {
    name: 'between',
    theme: 'math',
    args: [
      { name: 'x', type: 'num' },
      { name: 'lo', type: 'num' },
      { name: 'hi', type: 'num' },
    ],
    return: 'bool',
  },
];

const MATH_IMPL: Record<string, FnImpl> = {
  abs: (x) => preserveType(x, toDec(x).abs()),
  min: (...args) => {
    if (args.length === 0) throw new RunError('R2_ARITY', 'min needs at least 1 arg');
    let best = toDec(args[0]);
    let anyDec = isDec(args[0]);
    for (let i = 1; i < args.length; i++) {
      const cur = toDec(args[i]);
      if (isDec(args[i])) anyDec = true;
      if (cur.lt(best)) best = cur;
    }
    return anyDec ? best : best.toNumber();
  },
  max: (...args) => {
    if (args.length === 0) throw new RunError('R2_ARITY', 'max needs at least 1 arg');
    let best = toDec(args[0]);
    let anyDec = isDec(args[0]);
    for (let i = 1; i < args.length; i++) {
      const cur = toDec(args[i]);
      if (isDec(args[i])) anyDec = true;
      if (cur.gt(best)) best = cur;
    }
    return anyDec ? best : best.toNumber();
  },
  round: (x, digits = 0) => toDec(x).toDecimalPlaces(Number(digits), Decimal.ROUND_HALF_EVEN),
  ceil: (x) => toDec(x).toDecimalPlaces(0, Decimal.ROUND_CEIL),
  floor: (x) => toDec(x).toDecimalPlaces(0, Decimal.ROUND_FLOOR),
  sqrt: (x) => {
    const n = Number(x);
    if (n < 0) throw new RunError('R2_NEG_SQRT', `sqrt of negative ${n}`);
    return Math.sqrt(n);
  },
  pow: (base, exp) => Math.pow(Number(base), Number(exp)),
  percent: (part, whole) => {
    const w = toDec(whole);
    if (w.isZero()) throw new RunError('R2_DIVIDE_BY_ZERO', 'percent: whole is zero');
    return toDec(part).div(w).mul(100);
  },
  clamp: (x, lo, hi) => Math.min(Math.max(Number(x), Number(lo)), Number(hi)),
  between: (x, lo, hi) => Number(x) >= Number(lo) && Number(x) <= Number(hi),
};

const LOGIC_SIGS: FnSig[] = [
  {
    name: 'pickIf',
    theme: 'logic',
    args: [
      { name: 'cond', type: 'bool' },
      { name: 'then', type: ['num', 'dec', 'str', 'bool', 'date', 'time', 'datetime'] },
      { name: 'else', type: ['num', 'dec', 'str', 'bool', 'date', 'time', 'datetime'] },
    ],
    return: 'num',
  },
  {
    name: 'coalesce',
    theme: 'logic',
    args: [{ name: 'a', type: ['num', 'dec', 'str', 'bool', 'date', 'time', 'datetime', 'null'] }],
    return: 'num',
    variadic: true,
  },
  {
    name: 'inRange',
    theme: 'logic',
    args: [
      { name: 'x', type: 'num' },
      { name: 'lo', type: 'num' },
      { name: 'hi', type: 'num' },
    ],
    return: 'bool',
  },
];

const LOGIC_IMPL: Record<string, FnImpl> = {
  pickIf: (cond, t, e) => (cond ? t : e),
  coalesce: (...args) => {
    for (const a of args) {
      if (a !== null && a !== undefined) return a;
    }
    return null;
  },
  inRange: (x, lo, hi) => Number(x) >= Number(lo) && Number(x) <= Number(hi),
};

const CONV_SIGS: FnSig[] = [
  { name: 'toNumber', theme: 'conv', args: [{ name: 'x', type: ['str', 'dec', 'bool'] }], return: 'num' },
  { name: 'toDecimal', theme: 'conv', args: [{ name: 'x', type: ['str', 'num'] }], return: 'dec' },
  {
    name: 'toString',
    theme: 'conv',
    args: [{ name: 'x', type: ['num', 'dec', 'bool', 'date', 'time', 'datetime'] }],
    return: 'str',
  },
  { name: 'toBool', theme: 'conv', args: [{ name: 'x', type: ['num', 'str'] }], return: 'bool' },
  { name: 'toDate', theme: 'conv', args: [{ name: 's', type: 'str' }], return: 'date' },
  { name: 'toTime', theme: 'conv', args: [{ name: 's', type: 'str' }], return: 'time' },
  { name: 'toDateTime', theme: 'conv', args: [{ name: 's', type: 'str' }], return: 'datetime' },
];

const CONV_IMPL: Record<string, FnImpl> = {
  toNumber: (x) => {
    if (x instanceof Decimal) return x.toNumber();
    if (typeof x === 'boolean') return x ? 1 : 0;
    if (typeof x === 'string') {
      const trimmed = x.trim();
      if (trimmed.length === 0) throw new RunError('R2_PARSE', `cannot parse '' as number`);
      const n = Number(trimmed);
      if (!Number.isFinite(n)) throw new RunError('R2_PARSE', `cannot parse '${x}' as number`);
      return n;
    }
    if (typeof x === 'number' && Number.isFinite(x)) return x;
    throw new RunError('R2_PARSE', `cannot convert to number: ${typeof x}`);
  },
  toDecimal: (x) => {
    try {
      return new Decimal(x as string | number);
    } catch {
      throw new RunError('R2_PARSE', `cannot parse '${String(x)}' as decimal`);
    }
  },
  toString: (x: unknown) => (x instanceof Decimal ? x.toString() : String(x)),
  toBool: (x) => {
    if (typeof x === 'number') {
      if (x === 0) return false;
      if (x === 1) return true;
      throw new RunError('R2_PARSE', `cannot convert ${x} to bool (only 0/1)`);
    }
    const s = String(x).toLowerCase();
    if (s === 'true') return true;
    if (s === 'false') return false;
    throw new RunError('R2_PARSE', `cannot convert '${String(x)}' to bool`);
  },
  toDate: (s) => {
    const v = String(s);
    if (!parseDate(v)) throw new RunError('R2_PARSE', `invalid date '${v}'`);
    return v;
  },
  toTime: (s) => {
    const v = String(s);
    if (!parseTime(v)) throw new RunError('R2_PARSE', `invalid time '${v}'`);
    return v;
  },
  toDateTime: (s) => {
    const v = String(s);
    if (!parseDateTime(v)) throw new RunError('R2_PARSE', `invalid datetime '${v}'`);
    return v;
  },
};

function asDate(v: unknown): DateParts {
  const s = String(v);
  const d = parseDate(s);
  if (d) return d;
  const dt = parseDateTime(s);
  if (dt) return dt;
  throw new RunError('R2_PARSE', `expected date/datetime, got '${s}'`);
}

function asDateTime(v: unknown): DateTimeParts {
  const s = String(v);
  const dt = parseDateTime(s);
  if (dt) return dt;
  throw new RunError('R2_PARSE', `expected datetime, got '${s}'`);
}

function asTime(v: unknown): TimeParts {
  const s = String(v);
  const t = parseTime(s);
  if (t) return t;
  throw new RunError('R2_PARSE', `expected time, got '${s}'`);
}

function dateUtcMs(p: DateParts | DateTimeParts): number {
  const dt = p as DateTimeParts;
  const h = typeof dt.hour === 'number' ? dt.hour : 0;
  const m = typeof dt.minute === 'number' ? dt.minute : 0;
  const s = typeof dt.second === 'number' ? dt.second : 0;
  const tz = typeof dt.tzOffsetMin === 'number' ? dt.tzOffsetMin : 0;
  return Date.UTC(p.year, p.month - 1, p.day, h, m, s) - tz * 60000;
}

function fromMs(ms: number): DateTimeParts {
  const d = new Date(ms);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
  };
}

const isDateOnlyString = (v: unknown): boolean =>
  typeof v === 'string' && parseDate(v) !== null;

const DATE_SIGS: FnSig[] = [
  { name: 'today', theme: 'date', args: [], return: 'date' },
  { name: 'now', theme: 'date', args: [], return: 'datetime' },
  { name: 'parse_date', theme: 'date', args: [{ name: 's', type: 'str' }], return: 'date' },
  { name: 'parse_time', theme: 'date', args: [{ name: 's', type: 'str' }], return: 'time' },
  { name: 'parse_datetime', theme: 'date', args: [{ name: 's', type: 'str' }], return: 'datetime' },
  {
    name: 'combine',
    theme: 'date',
    args: [
      { name: 'd', type: 'date' },
      { name: 't', type: 'time' },
    ],
    return: 'datetime',
  },
  {
    name: 'add_days',
    theme: 'date',
    args: [
      { name: 'd', type: ['date', 'datetime'] },
      { name: 'n', type: 'num' },
    ],
    return: 'date',
  },
  {
    name: 'add_months',
    theme: 'date',
    args: [
      { name: 'd', type: ['date', 'datetime'] },
      { name: 'n', type: 'num' },
    ],
    return: 'date',
  },
  {
    name: 'add_years',
    theme: 'date',
    args: [
      { name: 'd', type: ['date', 'datetime'] },
      { name: 'n', type: 'num' },
    ],
    return: 'date',
  },
  {
    name: 'add_hours',
    theme: 'date',
    args: [
      { name: 'dt', type: 'datetime' },
      { name: 'n', type: 'num' },
    ],
    return: 'datetime',
  },
  {
    name: 'add_minutes',
    theme: 'date',
    args: [
      { name: 'dt', type: 'datetime' },
      { name: 'n', type: 'num' },
    ],
    return: 'datetime',
  },
  {
    name: 'days_between',
    theme: 'date',
    args: [
      { name: 'from', type: ['date', 'datetime'] },
      { name: 'to', type: ['date', 'datetime'] },
    ],
    return: 'num',
  },
  {
    name: 'business_days_between',
    theme: 'date',
    args: [
      { name: 'from', type: 'date' },
      { name: 'to', type: 'date' },
    ],
    return: 'num',
  },
  {
    name: 'hours_between',
    theme: 'date',
    args: [
      { name: 'from', type: 'datetime' },
      { name: 'to', type: 'datetime' },
    ],
    return: 'num',
  },
  {
    name: 'minutes_between',
    theme: 'date',
    args: [
      { name: 'from', type: 'datetime' },
      { name: 'to', type: 'datetime' },
    ],
    return: 'num',
  },
  { name: 'age', theme: 'date', args: [{ name: 'birthdate', type: 'date' }], return: 'num' },
  { name: 'year', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'num' },
  { name: 'month', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'num' },
  { name: 'day', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'num' },
  { name: 'weekday', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'num' },
  { name: 'hour', theme: 'date', args: [{ name: 'dt', type: ['datetime', 'time'] }], return: 'num' },
  { name: 'minute', theme: 'date', args: [{ name: 'dt', type: ['datetime', 'time'] }], return: 'num' },
  { name: 'second', theme: 'date', args: [{ name: 'dt', type: ['datetime', 'time'] }], return: 'num' },
  { name: 'date_of', theme: 'date', args: [{ name: 'dt', type: 'datetime' }], return: 'date' },
  { name: 'time_of', theme: 'date', args: [{ name: 'dt', type: 'datetime' }], return: 'time' },
  { name: 'is_weekend', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'bool' },
  { name: 'is_business_day', theme: 'date', args: [{ name: 'd', type: ['date', 'datetime'] }], return: 'bool' },
  {
    name: 'is_business_hours',
    theme: 'date',
    args: [
      { name: 't', type: 'time' },
      { name: 'open', type: 'time' },
      { name: 'close', type: 'time' },
    ],
    return: 'bool',
  },
];

const DATE_IMPL: Record<string, FnImpl> = {
  today: () => formatDate(fromMs(Date.now())),
  now: () => formatDateTime(fromMs(Date.now())),
  parse_date: (s) => {
    if (!parseDate(String(s))) throw new RunError('R2_PARSE', `invalid date '${String(s)}'`);
    return String(s);
  },
  parse_time: (s) => {
    if (!parseTime(String(s))) throw new RunError('R2_PARSE', `invalid time '${String(s)}'`);
    return String(s);
  },
  parse_datetime: (s) => {
    if (!parseDateTime(String(s))) throw new RunError('R2_PARSE', `invalid datetime '${String(s)}'`);
    return String(s);
  },
  combine: (d, t) => `${String(d)}T${String(t)}Z`,
  add_days: (d, n) => {
    const dateOnly = isDateOnlyString(d);
    const ms = dateUtcMs(asDate(d)) + Number(n) * 86400000;
    const out = fromMs(ms);
    return dateOnly ? formatDate(out) : formatDateTime(out);
  },
  add_months: (d, n) => {
    const dateOnly = isDateOnlyString(d);
    const p = asDate(d) as DateTimeParts;
    const h = typeof p.hour === 'number' ? p.hour : 0;
    const m = typeof p.minute === 'number' ? p.minute : 0;
    const s = typeof p.second === 'number' ? p.second : 0;
    const newMonth = p.month - 1 + Number(n);
    const yearOff = Math.floor(newMonth / 12);
    const monthIdx = ((newMonth % 12) + 12) % 12;
    const ms = Date.UTC(p.year + yearOff, monthIdx, p.day, h, m, s);
    const out = fromMs(ms);
    return dateOnly ? formatDate(out) : formatDateTime(out);
  },
  add_years: (d, n) => {
    const dateOnly = isDateOnlyString(d);
    const p = asDate(d) as DateTimeParts;
    const h = typeof p.hour === 'number' ? p.hour : 0;
    const m = typeof p.minute === 'number' ? p.minute : 0;
    const s = typeof p.second === 'number' ? p.second : 0;
    const ms = Date.UTC(p.year + Number(n), p.month - 1, p.day, h, m, s);
    const out = fromMs(ms);
    return dateOnly ? formatDate(out) : formatDateTime(out);
  },
  add_hours: (dt, n) => formatDateTime(fromMs(dateUtcMs(asDateTime(dt)) + Number(n) * 3600000)),
  add_minutes: (dt, n) => formatDateTime(fromMs(dateUtcMs(asDateTime(dt)) + Number(n) * 60000)),
  days_between: (from, to) => Math.floor((dateUtcMs(asDate(to)) - dateUtcMs(asDate(from))) / 86400000),
  business_days_between: (from, to) => {
    let cur = dateUtcMs(asDate(from));
    const end = dateUtcMs(asDate(to));
    let count = 0;
    while (cur < end) {
      cur += 86400000;
      const dow = new Date(cur).getUTCDay();
      if (dow !== 0 && dow !== 6) count++;
    }
    return count;
  },
  hours_between: (from, to) => Math.floor((dateUtcMs(asDateTime(to)) - dateUtcMs(asDateTime(from))) / 3600000),
  minutes_between: (from, to) => Math.floor((dateUtcMs(asDateTime(to)) - dateUtcMs(asDateTime(from))) / 60000),
  age: (birthdate) => {
    const b = asDate(birthdate);
    const now = fromMs(Date.now());
    let years = now.year - b.year;
    if (now.month < b.month || (now.month === b.month && now.day < b.day)) years--;
    return years;
  },
  year: (d) => asDate(d).year,
  month: (d) => asDate(d).month,
  day: (d) => asDate(d).day,
  weekday: (d) => weekdayMondayBased(asDate(d)),
  hour: (dt) => {
    const s = String(dt);
    const t = parseTime(s);
    if (t) return t.hour;
    return asDateTime(dt).hour;
  },
  minute: (dt) => {
    const s = String(dt);
    const t = parseTime(s);
    if (t) return t.minute;
    return asDateTime(dt).minute;
  },
  second: (dt) => {
    const s = String(dt);
    const t = parseTime(s);
    if (t) return t.second;
    return asDateTime(dt).second;
  },
  date_of: (dt) => formatDate(asDateTime(dt)),
  time_of: (dt) => formatTime(asDateTime(dt)),
  is_weekend: (d) => {
    const dow = weekdayMondayBased(asDate(d));
    return dow === 5 || dow === 6;
  },
  is_business_day: (d) => {
    const dow = weekdayMondayBased(asDate(d));
    return dow >= 0 && dow <= 4;
  },
  is_business_hours: (t, open, close) => {
    const a = asTime(t);
    const lo = asTime(open);
    const hi = asTime(close);
    const tn = a.hour * 3600 + a.minute * 60 + a.second;
    const ln = lo.hour * 3600 + lo.minute * 60 + lo.second;
    const hn = hi.hour * 3600 + hi.minute * 60 + hi.second;
    return tn >= ln && tn <= hn;
  },
};

const STR_SIGS: FnSig[] = [
  { name: 'length', theme: 'str', args: [{ name: 's', type: 'str' }], return: 'num' },
  { name: 'upper', theme: 'str', args: [{ name: 's', type: 'str' }], return: 'str' },
  { name: 'lower', theme: 'str', args: [{ name: 's', type: 'str' }], return: 'str' },
  { name: 'trim', theme: 'str', args: [{ name: 's', type: 'str' }], return: 'str' },
  { name: 'concat', theme: 'str', args: [{ name: 'a', type: 'str' }], return: 'str', variadic: true },
  {
    name: 'contains',
    theme: 'str',
    args: [
      { name: 's', type: 'str' },
      { name: 'sub', type: 'str' },
    ],
    return: 'bool',
  },
  {
    name: 'starts_with',
    theme: 'str',
    args: [
      { name: 's', type: 'str' },
      { name: 'prefix', type: 'str' },
    ],
    return: 'bool',
  },
  {
    name: 'ends_with',
    theme: 'str',
    args: [
      { name: 's', type: 'str' },
      { name: 'suffix', type: 'str' },
    ],
    return: 'bool',
  },
  {
    name: 'substring',
    theme: 'str',
    args: [
      { name: 's', type: 'str' },
      { name: 'start', type: 'num' },
      { name: 'length', type: 'num', optional: true },
    ],
    return: 'str',
  },
  {
    name: 'replace',
    theme: 'str',
    args: [
      { name: 's', type: 'str' },
      { name: 'find', type: 'str' },
      { name: 'with', type: 'str' },
    ],
    return: 'str',
  },
];

const STR_IMPL: Record<string, FnImpl> = {
  length: (s) => String(s).length,
  upper: (s) => String(s).toUpperCase(),
  lower: (s) => String(s).toLowerCase(),
  trim: (s) => String(s).trim(),
  concat: (...args) => args.map(String).join(''),
  contains: (s, sub) => String(s).includes(String(sub)),
  starts_with: (s, p) => String(s).startsWith(String(p)),
  ends_with: (s, p) => String(s).endsWith(String(p)),
  substring: (s, start, len) => {
    const str = String(s);
    const st = Number(start);
    if (len === undefined || len === null) return str.substring(st);
    return str.substring(st, st + Number(len));
  },
  replace: (s, f, w) => {
    const str = String(s);
    const find = String(f);
    const idx = str.indexOf(find);
    if (idx < 0) return str;
    return str.slice(0, idx) + String(w) + str.slice(idx + find.length);
  },
};

const MONEY_SIGS: FnSig[] = [
  {
    name: 'tax_amount',
    theme: 'money',
    args: [
      { name: 'amount', type: 'dec' },
      { name: 'rate_pct', type: 'num' },
    ],
    return: 'dec',
  },
  {
    name: 'add_tax',
    theme: 'money',
    args: [
      { name: 'amount', type: 'dec' },
      { name: 'rate_pct', type: 'num' },
    ],
    return: 'dec',
  },
  { name: 'currency_round', theme: 'money', args: [{ name: 'x', type: 'dec' }], return: 'dec' },
  {
    name: 'percent_of',
    theme: 'money',
    args: [
      { name: 'part', type: 'dec' },
      { name: 'whole', type: 'dec' },
    ],
    return: 'dec',
  },
  {
    name: 'apply_discount',
    theme: 'money',
    args: [
      { name: 'amount', type: 'dec' },
      { name: 'discount_pct', type: 'num' },
    ],
    return: 'dec',
  },
  {
    name: 'compound_interest',
    theme: 'money',
    args: [
      { name: 'principal', type: 'dec' },
      { name: 'rate_pct', type: 'num' },
      { name: 'years', type: 'num' },
      { name: 'periods', type: 'num', optional: true, default: 1 },
    ],
    return: 'dec',
  },
  {
    name: 'loan_payment',
    theme: 'money',
    args: [
      { name: 'principal', type: 'dec' },
      { name: 'annual_rate_pct', type: 'num' },
      { name: 'years', type: 'num' },
    ],
    return: 'dec',
  },
];

const MONEY_IMPL: Record<string, FnImpl> = {
  tax_amount: (amount, rate) => toDec(amount).mul(Number(rate)).div(100),
  add_tax: (amount, rate) => {
    const a = toDec(amount);
    return a.plus(a.mul(Number(rate)).div(100));
  },
  currency_round: (x) => toDec(x).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
  percent_of: (part, whole) => {
    const w = toDec(whole);
    if (w.isZero()) throw new RunError('R2_DIVIDE_BY_ZERO', 'percent_of: whole is zero');
    return toDec(part).div(w).mul(100);
  },
  apply_discount: (amount, pct) => toDec(amount).mul(100 - Number(pct)).div(100),
  compound_interest: (principal, rate, years, periods = 1) => {
    const p = toDec(principal);
    const r = Number(rate) / 100;
    const n = Number(periods);
    const t = Number(years);
    return p.mul(new Decimal(1 + r / n).pow(n * t));
  },
  loan_payment: (principal, annualRatePct, years) => {
    const p = toDec(principal).toNumber();
    const r = Number(annualRatePct) / 100 / 12;
    const n = Number(years) * 12;
    if (r === 0) return new Decimal(p / n);
    return new Decimal((p * r) / (1 - Math.pow(1 + r, -n)));
  },
};

interface ThemeDef {
  sigs: FnSig[];
  impl: Record<string, FnImpl>;
}

const THEMES: Record<string, ThemeDef> = {
  math: { sigs: MATH_SIGS, impl: MATH_IMPL },
  logic: { sigs: LOGIC_SIGS, impl: LOGIC_IMPL },
  conv: { sigs: CONV_SIGS, impl: CONV_IMPL },
  date: { sigs: DATE_SIGS, impl: DATE_IMPL },
  str: { sigs: STR_SIGS, impl: STR_IMPL },
  money: { sigs: MONEY_SIGS, impl: MONEY_IMPL },
};

export type ThemeName = keyof typeof THEMES;

export const DEFAULT_THEMES: ThemeName[] = ['math', 'logic', 'conv'];

export function loadDefaults(reg: FunctionRegistry): void {
  for (const t of DEFAULT_THEMES) reg.loadTheme(t);
}
