import { zMembershipInviteBody, zSystemInviteBody } from 'sdk/zod.gen';
import { describe, expect, it } from 'vitest';
import { isInviteEmail } from '~/modules/common/form-fields/select-emails';

const accepted = [
  'user@example.com',
  'User@Example.COM',
  'user+tag@example.com',
  'first.last@sub.example.co.uk',
  "o'brien@example.ie",
  'user@EXAMPLE.COM',
  'user-@example.com',
  'user_@example.com',
  'user@xn--bcher-kva.de',
  'a@b.co',
  'user@1example.com',
  'user@123.com',
  'user@EXAMPLE.co',
  'a.b-c_d+e@x-y.io',
  `${'a'.repeat(64)}@example.com`,
  `a@${'b'.repeat(63)}.com`,
  `a@${'b'.repeat(64)}.com`,
  `a@${'b.'.repeat(124)}com`,
  `${'a'.repeat(64)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.com`,
  // The next three were refused as chips although a submit accepts them.
  'user@example-.com',
  'user@sub-.example.com',
  `${'a'.repeat(65)}@example.com`,
];

const rejected = [
  'user@example.C0M',
  'user@example',
  'user@localhost',
  'user@example.com.',
  'user.@example.com',
  '.user@example.com',
  'us..er@example.com',
  'user@-example.com',
  'user@exa_mple.com',
  'user@[192.168.0.1]',
  'user@192.168.0.1',
  'John Doe <john@example.com>',
  'x@y.z',
  ' user@example.com',
  'user @example.com',
  'user@@example.com',
  'user@exa mple.com',
  'user@example.c',
  'user@example.123',
  // The rest became chips that a submit then refused.
  'us..er@gmail.com',
  '.user@gmail.com',
  '"john doe"@example.com',
  '"a@b"@example.com',
  'jöhn@example.com',
  'ÄBC@example.com',
  'user@bücher.de',
  'user@example.xn--p1ai',
  'user@пример.рф',
  '用户@例子.广告',
  'a#b$c%d&@example.com',
  'a/b=c?d^e`f{g|h}i~@example.com',
  'a*b!@example.com',
  `${'a'.repeat(64)}@${'b'.repeat(60)}.${'c'.repeat(60)}.${'d'.repeat(60)}.${'e'.repeat(20)}.com`,
];

const submits = (email: string) =>
  zSystemInviteBody.safeParse({ emails: [email] }).success && zMembershipInviteBody.shape.emails.safeParse([email]).success;

describe('isInviteEmail', () => {
  it.each(accepted)('accepts %s', (email) => {
    expect(isInviteEmail(email)).toBe(true);
    expect(submits(email)).toBe(true);
  });

  it.each(rejected)('rejects %s', (email) => {
    expect(isInviteEmail(email)).toBe(false);
    expect(submits(email)).toBe(false);
  });
});
