const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const DAYS_PER_MONTH = 365 / 12;

function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * How long ago `date` was, in the largest whole unit that fits: minutes under an
 * hour, hours under a day, days under a month, months under a year, then years.
 * e.g. "5 minutes ago", "1 hour ago", "3 days ago", "2 months ago", "1 year ago".
 */
export function timeAgo(date: Date, now: Date = new Date()): string {
  const elapsed = Math.max(0, now.getTime() - date.getTime());

  if (elapsed < HOUR) {
    const minutes = Math.floor(elapsed / MINUTE);
    return minutes === 0 ? 'Just now' : plural(minutes, 'minute');
  }
  if (elapsed < DAY) return plural(Math.floor(elapsed / HOUR), 'hour');

  const days = Math.floor(elapsed / DAY);
  if (days < 365) {
    // A month is an average one (~30.4 days), so this never reaches "12 months".
    const months = Math.floor(days / DAYS_PER_MONTH);
    return months === 0 ? plural(days, 'day') : plural(months, 'month');
  }
  return plural(Math.floor(days / 365), 'year');
}
