import { appConfig } from 'shared';
import { nanoid } from 'shared/utils/nanoid';
import type { AuthContext } from '#/core/context';
import { AppError } from '#/core/error';
import { mailer } from '#/lib/mailer';
import { linkWaitlistRequest } from '#/modules/requests/requests-queries';
import { findPendingInvitationTokens, findVerifiedEmails, insertTokens } from '#/modules/system/system-queries';
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

  const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
  if (normalizedEmails.length === 0) throw new AppError(400, 'no_recipients', 'warn');

  const now = new Date();

  // Emails already belonging to a verified user (a user can have multiple emails)
  const existingEmailRecords = await findVerifiedEmails(ctx, { emails: normalizedEmails });
  const existingEmails = new Set(existingEmailRecords.map((r) => r.email));

  const pendingTokens = await findPendingInvitationTokens(ctx, { emails: normalizedEmails });

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

  // One independent random secret per recipient, so one link never authenticates another's invitation.
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

  await Promise.all(insertedTokens.map((t) => linkWaitlistRequest(ctx, { email: t.email, tokenId: t.id })));

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
