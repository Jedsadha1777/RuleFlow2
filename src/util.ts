export function isAlpha(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_';
}

export function isDigit(c: string): boolean {
  return c >= '0' && c <= '9';
}

export function isAlphaNum(c: string): boolean {
  return isAlpha(c) || isDigit(c);
}

export function isWhitespace(c: string): boolean {
  return c === ' ' || c === '\t' || c === '\n' || c === '\r';
}

export function isValidIdent(s: string): boolean {
  if (s.length === 0) return false;
  if (!isAlpha(s[0])) return false;
  for (let i = 1; i < s.length; i++) {
    if (!isAlphaNum(s[i])) return false;
  }
  return true;
}

export interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface TimeParts {
  hour: number;
  minute: number;
  second: number;
}

export interface DateTimeParts extends DateParts, TimeParts {
  tzOffsetMin?: number; // minutes east of UTC; undefined or 0 = UTC
}

export function parseDate(s: string): DateParts | null {
  if (s.length !== 10) return null;
  if (s[4] !== '-' || s[7] !== '-') return null;
  for (const i of [0, 1, 2, 3, 5, 6, 8, 9]) {
    if (!isDigit(s[i])) return null;
  }
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  const day = Number(s.slice(8, 10));
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function parseTime(s: string): TimeParts | null {
  if (s.length !== 8) return null;
  if (s[2] !== ':' || s[5] !== ':') return null;
  for (const i of [0, 1, 3, 4, 6, 7]) {
    if (!isDigit(s[i])) return null;
  }
  const hour = Number(s.slice(0, 2));
  const minute = Number(s.slice(3, 5));
  const second = Number(s.slice(6, 8));
  if (hour > 23 || minute > 59 || second > 59) return null;
  return { hour, minute, second };
}

export function parseDateTime(s: string): DateTimeParts | null {
  if (s.length < 19) return null;
  if (s[10] !== 'T') return null;
  const date = parseDate(s.slice(0, 10));
  if (!date) return null;
  const time = parseTime(s.slice(11, 19));
  if (!time) return null;
  let tzOffsetMin = 0;
  if (s.length > 19) {
    const off = parseTimezone(s.slice(19));
    if (off === null) return null;
    tzOffsetMin = off;
  }
  return { ...date, ...time, tzOffsetMin };
}

function parseTimezone(tz: string): number | null {
  if (tz === 'Z') return 0;
  if (tz.length !== 6) return null;
  if (tz[0] !== '+' && tz[0] !== '-') return null;
  if (tz[3] !== ':') return null;
  for (const i of [1, 2, 4, 5]) {
    if (!isDigit(tz[i])) return null;
  }
  const h = Number(tz.slice(1, 3));
  const m = Number(tz.slice(4, 6));
  if (h > 14 || m > 59) return null;
  const mins = h * 60 + m;
  return tz[0] === '-' ? -mins : mins;
}

export function isValidDate(s: string): boolean {
  return parseDate(s) !== null;
}

export function isValidTime(s: string): boolean {
  return parseTime(s) !== null;
}

export function isValidDateTime(s: string): boolean {
  return parseDateTime(s) !== null;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    return leap ? 29 : 28;
  }
  if (month === 4 || month === 6 || month === 9 || month === 11) return 30;
  return 31;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function formatDate(p: DateParts): string {
  return `${String(p.year).padStart(4, '0')}-${pad2(p.month)}-${pad2(p.day)}`;
}

export function formatTime(p: TimeParts): string {
  return `${pad2(p.hour)}:${pad2(p.minute)}:${pad2(p.second)}`;
}

export function formatDateTime(p: DateTimeParts): string {
  return `${formatDate(p)}T${formatTime(p)}Z`;
}

export function weekdayMondayBased(p: DateParts): number {
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day));
  return (d.getUTCDay() + 6) % 7;
}
