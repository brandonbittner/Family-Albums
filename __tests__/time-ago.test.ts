import { timeAgo } from '@/lib/time-ago';

const now = new Date('2026-10-30T12:00:00Z');
const ago = (ms: number) => timeAgo(new Date(now.getTime() - ms), now);

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('timeAgo', () => {
  it('uses minutes under an hour', () => {
    expect(ago(20 * 1000)).toBe('Just now');
    expect(ago(1 * MINUTE)).toBe('1 minute ago');
    expect(ago(59 * MINUTE)).toBe('59 minutes ago');
  });

  it('uses hours from an hour up to a day', () => {
    expect(ago(1 * HOUR)).toBe('1 hour ago');
    expect(ago(23 * HOUR + 59 * MINUTE)).toBe('23 hours ago');
  });

  it('uses days from a day up to a month', () => {
    expect(ago(1 * DAY)).toBe('1 day ago');
    expect(ago(29 * DAY)).toBe('29 days ago');
  });

  it('uses months from a month up to a year', () => {
    expect(ago(31 * DAY)).toBe('1 month ago');
    expect(ago(200 * DAY)).toBe('6 months ago');
    expect(ago(364 * DAY)).toBe('11 months ago');
  });

  it('uses years from a year on', () => {
    expect(ago(365 * DAY)).toBe('1 year ago');
    expect(ago(3 * 365 * DAY + 10 * DAY)).toBe('3 years ago');
  });

  it('treats future dates as just now', () => {
    expect(ago(-5 * MINUTE)).toBe('Just now');
  });
});
