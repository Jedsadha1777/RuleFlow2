import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = readFileSync(new URL('../ui/dt-parts.js', import.meta.url), 'utf-8');
const sandbox: {
  partsFromIso?: Function;
  isoFromParts?: Function;
  browserTzOffset?: Function;
} = {};
new Function('window', src)(sandbox);
const partsFromIso = sandbox.partsFromIso as (type: string, val: string) => Record<string, string>;
const isoFromParts = sandbox.isoFromParts as (type: string, p: Record<string, string>) => string;
const browserTzOffset = sandbox.browserTzOffset as (d?: Date) => string;

describe('partsFromIso', () => {
  it('date keeps full ISO YYYY-MM-DD as p.date', () => {
    expect(partsFromIso('date', '2026-05-04')).toEqual({
      date: '2026-05-04', hour: '', minute: '', second: '',
    });
  });
  it('time splits into HH/MM/SS', () => {
    expect(partsFromIso('time', '14:30:45')).toEqual({
      date: '', hour: '14', minute: '30', second: '45',
    });
  });
  it('datetime: date as YYYY-MM-DD + time parts', () => {
    expect(partsFromIso('datetime', '2026-05-04T14:30:45Z')).toEqual({
      date: '2026-05-04', hour: '14', minute: '30', second: '45',
    });
  });
  it('empty input → empty parts', () => {
    expect(partsFromIso('date', '')).toEqual({ date: '', hour: '', minute: '', second: '' });
    expect(partsFromIso('datetime', '')).toEqual({ date: '', hour: '', minute: '', second: '' });
  });
});

describe('isoFromParts (always emits strict ISO-8601)', () => {
  it('date passes through native picker output', () => {
    expect(isoFromParts('date', { date: '2026-05-04' })).toBe('2026-05-04');
  });

  it('date: empty date → empty', () => {
    expect(isoFromParts('date', { date: '' })).toBe('');
  });

  it('time: HH+MM dropdown → HH:MM:00', () => {
    expect(isoFromParts('time', { hour: '14', minute: '30' })).toBe('14:30:00');
    expect(isoFromParts('time', { hour: '00', minute: '00' })).toBe('00:00:00');
  });

  it('time: missing hour or minute → empty', () => {
    expect(isoFromParts('time', { hour: '', minute: '30' })).toBe('');
    expect(isoFromParts('time', { hour: '14', minute: '' })).toBe('');
  });

  it('datetime: defaults to Z when no tz given', () => {
    expect(isoFromParts('datetime', { date: '2026-05-04', hour: '14', minute: '30' }))
      .toBe('2026-05-04T14:30:00Z');
  });

  it('datetime: appends explicit tz offset (UI passes browser tz)', () => {
    expect(isoFromParts('datetime', { date: '2026-05-04', hour: '14', minute: '30', tz: '+07:00' }))
      .toBe('2026-05-04T14:30:00+07:00');
    expect(isoFromParts('datetime', { date: '2026-05-04', hour: '09', minute: '00', tz: '-05:00' }))
      .toBe('2026-05-04T09:00:00-05:00');
  });

  it('datetime: missing date (---) → empty', () => {
    expect(isoFromParts('datetime', { date: '', hour: '14', minute: '30' })).toBe('');
  });

  it('datetime: missing time → empty', () => {
    expect(isoFromParts('datetime', { date: '2026-05-04', hour: '', minute: '' })).toBe('');
  });

  it('round-trip: ISO → parts → ISO unchanged', () => {
    const orig = '2026-12-25T08:15:00Z';
    expect(isoFromParts('datetime', partsFromIso('datetime', orig))).toBe(orig);
  });

  it('output passes engine strict parser (length ≥ 19, ends with Z)', () => {
    const built = isoFromParts('datetime', { date: '2026-05-04', hour: '14', minute: '30' });
    expect(built.length).toBeGreaterThanOrEqual(19);
    expect(built.endsWith('Z')).toBe(true);
  });
});

describe('browserTzOffset', () => {
  it('produces "Z" or "±HH:MM"', () => {
    const tz = browserTzOffset();
    expect(tz === 'Z' || /^[+-]\d{2}:\d{2}$/.test(tz)).toBe(true);
  });

  it('format matches engine TZ parser (regression vs locale-emitted strings)', () => {
    const tz = browserTzOffset();
    if (tz !== 'Z') {
      expect(tz).toMatch(/^[+-](?:0\d|1[0-4]):[0-5]\d$/);
    }
  });
});
