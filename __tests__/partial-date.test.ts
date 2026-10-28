import {
  calendarWeeks,
  daysInMonth,
  formatPartialDate,
  normalizePartialDate,
  partialDateFromDate,
} from '@/lib/partial-date';

describe('normalizePartialDate', () => {
  it('drops parts whose predecessor is missing', () => {
    expect(normalizePartialDate({ year: null, month: 6, day: 14 })).toEqual({
      year: null,
      month: null,
      day: null,
    });
    expect(normalizePartialDate({ year: 1987, month: null, day: 14 })).toEqual({
      year: 1987,
      month: null,
      day: null,
    });
  });

  it('drops a day the month does not have', () => {
    expect(normalizePartialDate({ year: 2023, month: 2, day: 29 }).day).toBeNull();
    expect(normalizePartialDate({ year: 2024, month: 2, day: 29 }).day).toBe(29);
  });

  it('keeps a complete valid date', () => {
    expect(normalizePartialDate({ year: 1987, month: 6, day: 14 })).toEqual({
      year: 1987,
      month: 6,
      day: 14,
    });
  });
});

describe('daysInMonth', () => {
  it('handles leap years and month lengths', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(1900, 2)).toBe(28);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('formatPartialDate', () => {
  it('formats only the known parts', () => {
    expect(formatPartialDate({ year: 1987, month: null, day: null })).toBe('1987');
    expect(formatPartialDate({ year: 1987, month: 6, day: null })).toMatch(/Jun.*1987/);
    expect(formatPartialDate({ year: 1987, month: 6, day: 14 })).toMatch(/Jun.*14.*1987/);
    expect(formatPartialDate({ year: null, month: null, day: null })).toBe('');
  });
});

describe('partialDateFromDate', () => {
  it('uses local date parts with a 1-based month', () => {
    expect(partialDateFromDate(new Date(1987, 5, 14, 23, 30))).toEqual({
      year: 1987,
      month: 6,
      day: 14,
    });
  });
});

describe('calendarWeeks', () => {
  it('lays out a month Sunday–Saturday with neighbouring days as padding', () => {
    // October 2026 starts on a Thursday and has 31 days.
    const weeks = calendarWeeks(2026, 10);
    expect(weeks).toHaveLength(5);
    expect(weeks[0].slice(0, 4)).toEqual([
      { day: 27, inMonth: false },
      { day: 28, inMonth: false },
      { day: 29, inMonth: false },
      { day: 30, inMonth: false },
    ]);
    expect(weeks[0][4]).toEqual({ day: 1, inMonth: true });
    expect(weeks[4][6]).toEqual({ day: 31, inMonth: true });
  });

  it("pads the last week with next month's days", () => {
    // February 2026 starts on a Sunday and has 28 days — exactly four weeks.
    expect(calendarWeeks(2026, 2)).toHaveLength(4);
    // March 2026 starts on a Sunday; 31 days spills into a fifth week.
    const march = calendarWeeks(2026, 3);
    expect(march[4][3]).toEqual({ day: 1, inMonth: false });
  });
});
