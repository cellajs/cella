import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import {
  findPendingInvitationTokens,
  findVerifiedEmails,
  insertTokens,
  linkWaitlistRequest,
} from '#/modules/system/system-queries';
import { hashToken } from '#/utils/hash-token';
import { log } from '#/utils/logger';
import { slugFromEmail } from '#/utils/slug-from-email';
import { createDate, TimeSpan } from '#/utils/time-span';
import { systemInviteEmail } from '../../../../emails';

export async function createInviteOp(ctx: AuthContext, emails: string[]) {
  const user = ctx.var.user;
  const lng = user.language;
  const senderName = user.name;
  const senderThumbnailUrl = user.thumbnailUrl;

  // Normalize + de-dupe
  const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
  if (normalizedEmails.length === 0) throw new AppError(400, 'no_recipients', 'warn');

  const now = new Date();

  // 1) Emails that already belong to a verified user (users can have multiple emails)
  const existingEmailRecords = await findVerifiedEmails(ctx, { emails: normalizedEmails });
  const existingEmails = new Set(existingEmailRecords.map((r) => r.email));

  // 2) Pending invitation tokens for normalized emails
  const pendingTokens = await findPendingInvitationTokens(ctx, { emails: normalizedEmails });

  // Index tokens per email, classify active vs expired
  const activeTokenByEmail = new Map<string, { id: string }>();
  const expiredTokenIdsByEmail = new Map<string, string[]>();

  for (const t of pendingTokens) {
    const isActive = new Date(t.expiresAt) > now;
    if (isActive) activeTokenByEmail.set(t.email, { id: t.id });
    else {
      const arr = expiredTokenIdsByEmail.get(t.email) ?? [];
      arr.push(t.id);
      expiredTokenIdsByEmail.set(t.email, arr);
    }
  }

  // 3) Decide recipients vs rejected based on scenarios
  const recipientEmails: string[] = [];
  const rejectedIds: string[] = [];

  for (const email of normalizedEmails) {
    if (existingEmails.has(email)) {
      rejectedIds.push(email);
      continue;
    }

    if (activeTokenByEmail.has(email)) {
      rejectedIds.push(email);
      continue;
    }

    // Either no token at all OR expired token(s)
    recipientEmails.push(email);
  }

  if (recipientEmails.length === 0) {
    return { data: [] as never[], rejectedIds, invitesSentCount: 0 };
  }

  // Mint a distinct token per recipient. Each secret is an independent random value, so one recipient's
  // link never authenticates another's invitation and consuming one leaves the others untouched.
  const rawByEmail = new Map<string, string>();
  const tokens = recipientEmails.map((email) => {
    const raw = nanoid(40);
    rawByEmail.set(email, raw);
    return {
      secret: hashToken(raw),
      type: 'invitation' as const,
      email,
      createdBy: user.id,
      expiresAt: createDate(new TimeSpan(7, 'd')),
    };
  });

  const insertedTokens = await insertTokens(ctx, { tokens });

  // Link waitlist requests (if any)
  await Promise.all(insertedTokens.map((t) => linkWaitlistRequest(ctx, { email: t.email, tokenId: t.id })));

  // Prepare & send emails
  const recipients = insertedTokens.map(({ email, type }) => ({
    email,
    lng,
    name: slugFromEmail(email),
    inviteLink: `${appConfig.backendAuthUrl}/invoke-token/${type}/${rawByEmail.get(email)}`,
  }));

  const staticProps = { senderName, senderThumbnailUrl };
  await mailer.prepareEmails(systemInviteEmail, staticProps, recipients, user.email);

  log.info('Users invited on system level', { count: recipients.length });

  return { data: [] as never[], rejectedIds, invitesSentCount: recipients.length };
}
