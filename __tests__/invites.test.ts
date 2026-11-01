import { inviteErrorMessage, isValidEmail, normalizeEmail, parseEmails } from '@/lib/invites';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));

describe('normalizeEmail', () => {
  it('trims and lowercases', () => {
    expect(normalizeEmail('  Grandma@Example.COM ')).toBe('grandma@example.com');
  });
});

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+albums@mail.example.org', ' Padded@Example.com '])(
    'accepts %s',
    (email) => expect(isValidEmail(email)).toBe(true),
  );

  it.each(['', 'grandma', 'grandma@', '@example.com', 'a@b', 'a b@c.com', 'a@b@c.com'])(
    'rejects %p',
    (email) => expect(isValidEmail(email)).toBe(false),
  );
});

describe('parseEmails', () => {
  it('splits on commas, semicolons, spaces and new lines', () => {
    expect(parseEmails('a@x.com, b@x.com;c@x.com\nd@x.com  e@x.com').valid).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
      'e@x.com',
    ]);
  });

  it('normalizes and drops duplicates', () => {
    expect(parseEmails('Grandma@X.com grandma@x.com').valid).toEqual(['grandma@x.com']);
  });

  it('returns what is not an email as typed', () => {
    expect(parseEmails('a@x.com, Grandma, b@x')).toEqual({
      valid: ['a@x.com'],
      invalid: ['Grandma', 'b@x'],
    });
  });

  it('handles empty input', () => {
    expect(parseEmails('  , ')).toEqual({ valid: [], invalid: [] });
  });
});

describe('inviteErrorMessage', () => {
  it('maps database error codes to messages', () => {
    expect(inviteErrorMessage({ message: 'already_invited' })).toBe(
      'That person has already been invited.',
    );
    expect(inviteErrorMessage(new Error('cannot_invite_self'))).toBe(
      'That’s your own email address.',
    );
  });

  it('falls back to a generic message', () => {
    expect(inviteErrorMessage(new Error('network down'))).toBe(
      'Something went wrong. Please try again.',
    );
    expect(inviteErrorMessage(undefined)).toBe('Something went wrong. Please try again.');
  });
});
