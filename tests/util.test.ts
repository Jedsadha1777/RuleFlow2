import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDateTime,
  formatTime,
  isValidDate,
  isValidDateTime,
  isValidIdent,
  isValidTime,
  parseDate,
  parseDateTime,
  parseTime,
  weekdayMondayBased,
} from '../src/util.js';

describe('isValidIdent', () => {
  it('accepts valid identifiers', () => {
    expect(isValidIdent('a')).toBe(true);
    expect(isValidIdent('foo_bar')).toBe(true);
    expect(isValidIdent('_x')).toBe(true);
    expect(isValidIdent('x123')).toBe(true);
  });

  it('rejects invalid', () => {
    expect(isValidIdent('')).toBe(false);
    expect(isValidIdent('1abc')).toBe(false);
    expect(isValidIdent('foo bar')).toBe(false);
    expect(isValidIdent('foo-bar')).toBe(false);
    expect(isValidIdent('$foo')).toBe(false);
  });
});

describe('iso date', () => {
  it('valid dates', () => {
    expect(isValidDate('2026-05-04')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(parseDate('2026-05-04')).toEqual({ year: 2026, month: 5, day: 4 });
  });

  it('invalid dates', () => {
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2025-02-29')).toBe(false);
    expect(isValidDate('2026/05/04')).toBe(false);
    expect(isValidDate('20260504')).toBe(false);
    expect(isValidDate('2026-5-4')).toBe(false);
  });

  it('formatDate', () => {
    expect(formatDate({ year: 2026, month: 5, day: 4 })).toBe('2026-05-04');
  });

  it('weekday', () => {
    expect(weekdayMondayBased({ year: 2026, month: 5, day: 4 })).toBe(0);
    expect(weekdayMondayBased({ year: 2026, month: 5, day: 9 })).toBe(5);
    expect(weekdayMondayBased({ year: 2026, month: 5, day: 10 })).toBe(6);
  });
});

describe('iso time', () => {
  it('valid', () => {
    expect(isValidTime('14:30:00')).toBe(true);
    expect(isValidTime('00:00:00')).toBe(true);
    expect(isValidTime('23:59:59')).toBe(true);
    expect(parseTime('14:30:45')).toEqual({ hour: 14, minute: 30, second: 45 });
  });

  it('invalid', () => {
    expect(isValidTime('24:00:00')).toBe(false);
    expect(isValidTime('14:60:00')).toBe(false);
    expect(isValidTime('14:30')).toBe(false);
    expect(isValidTime('14-30-00')).toBe(false);
  });

  it('formatTime', () => {
    expect(formatTime({ hour: 9, minute: 5, second: 30 })).toBe('09:05:30');
  });
});

describe('iso datetime', () => {
  it('valid', () => {
    expect(isValidDateTime('2026-05-04T14:30:00')).toBe(true);
    expect(isValidDateTime('2026-05-04T14:30:00Z')).toBe(true);
    expect(isValidDateTime('2026-05-04T14:30:00+07:00')).toBe(true);
  });

  it('invalid', () => {
    expect(isValidDateTime('2026-05-04 14:30:00')).toBe(false);
    expect(isValidDateTime('2026-05-04T14:30')).toBe(false);
    expect(isValidDateTime('not-a-datetime')).toBe(false);
  });

  it('parseDateTime', () => {
    expect(parseDateTime('2026-05-04T14:30:45Z')).toEqual({
      year: 2026,
      month: 5,
      day: 4,
      hour: 14,
      minute: 30,
      second: 45,
      tzOffsetMin: 0,
    });
  });

  it('formatDateTime', () => {
    expect(formatDateTime({ year: 2026, month: 5, day: 4, hour: 14, minute: 30, second: 0 }))
      .toBe('2026-05-04T14:30:00Z');
  });
});
