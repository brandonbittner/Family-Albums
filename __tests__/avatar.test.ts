import { initialsFromName } from '@/components/Avatar';

describe('initialsFromName', () => {
  it('uses the first and last name', () => {
    expect(initialsFromName('Brandon Bittner')).toBe('BB');
    expect(initialsFromName('  mary   ann  smith ')).toBe('MS');
  });

  it('uses one letter for a single name', () => {
    expect(initialsFromName('Grandma')).toBe('G');
  });

  it("falls back to the fallback's first letter, then ?", () => {
    expect(initialsFromName(null, 'pending@example.com')).toBe('P');
    expect(initialsFromName('   ', 'x@y.z')).toBe('X');
    expect(initialsFromName(undefined)).toBe('?');
  });
});
