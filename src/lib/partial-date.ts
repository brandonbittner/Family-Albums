/**
 * A date where only some parts may be known — just the year, the year and
 * month, or all three. Parts are only meaningful in order: a month without a
 * year, or a day without a month, is ignored.
 */
export type PartialDate = {
  year: number | null;
  /** 1–12 */
  month: number | null;
  day: number | null;
};

export const EMPTY_PARTIAL_DATE: PartialDate = { year: null, month: null, day: null };

export const MIN_YEAR = 1800;

/** Days in a 1-based month. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Drops any part whose predecessor is missing, and any day the month doesn't have. */
export function normalizePartialDate({ year, month, day }: PartialDate): PartialDate {
  if (year === null) return EMPTY_PARTIAL_DATE;
  if (month === null) return { year, month: null, day: null };
  if (day === null || day > daysInMonth(year, month)) return { year, month, day: null };
  return { year, month, day };
}

export function partialDateFromDate(date: Date): PartialDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

export function isSamePartialDate(a: PartialDate, b: PartialDate): boolean {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function monthName(month: number, format: 'short' | 'long' = 'short'): string {
  return new Date(2000, month - 1, 1).toLocaleDateString(undefined, { month: format });
}

/** "1987", "Jun 1987", or "Jun 14, 1987". */
export function formatPartialDate(date: PartialDate): string {
  const { year, month, day } = normalizePartialDate(date);
  if (year === null) return '';
  if (month === null) return String(year);
  return new Date(year, month - 1, day ?? 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
    ...(day !== null ? { day: 'numeric' } : {}),
  });
}

export type CalendarCell = { day: number; inMonth: boolean };

/**
 * Weeks (Sunday–Saturday) covering a 1-based month, padded with the trailing
 * days of the previous month and leading days of the next.
 */
export function calendarWeeks(year: number, month: number): CalendarCell[][] {
  const leading = new Date(year, month - 1, 1).getDay();
  const days = daysInMonth(year, month);
  const prevDays = daysInMonth(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
  const total = Math.ceil((leading + days) / 7) * 7;

  const cells: CalendarCell[] = Array.from({ length: total }, (_, i) => {
    if (i < leading) return { day: prevDays - leading + 1 + i, inMonth: false };
    if (i < leading + days) return { day: i - leading + 1, inMonth: true };
    return { day: i - leading - days + 1, inMonth: false };
  });
  return Array.from({ length: total / 7 }, (_, w) => cells.slice(w * 7, w * 7 + 7));
}

/** Two-letter weekday labels starting on Sunday, e.g. "Su", "Mo". */
export function weekdayLabels(): string[] {
  // 2 Jan 2000 was a Sunday.
  return Array.from({ length: 7 }, (_, i) =>
    new Date(2000, 0, 2 + i).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2),
  );
}
