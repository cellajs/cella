import type { UserContext } from '#/core/context';
import { AppError } from '#/core/error';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { findSystemInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { sendInvitationMails } from '#/modules/memberships/helpers/invitation-mail';
import { linkWaitlistRequest } from '#/modules/requests/requests-queries';
import { findVerifiedEmails } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';

export async function createInviteOp(ctx: UserContext, emails: string[]) {
  const user = ctx.var.user;

  const normalizedEmails = [...new Set(emails.map((e) => e.toLowerCase().trim()))];
  if (normalizedEmails.length === 0) throw new AppError(400, 'no_recipients', 'warn');

  const now = new Date();

  // Emails already belonging to a verified user
  const existingEmailRecords = await findVerifiedEmails(ctx, { emails: normalizedEmails });
  const existingEmails = new Set(existingEmailRecords.map((r) => r.email));

  const pendingTokens = await findSystemInvitationTokens(ctx, { emails: normalizedEmails });

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

  // One independent random secret per recipient, so one link never authenticates another's invitation. Each replaces
  // the earlier system invitations of its address.
  const issued = await issueTokens(
    ctx,
    recipientEmails.map((email) => ({ type: 'invitation' as const, email, createdBy: user.id })),
  );

  await Promise.all(issued.map(({ token }) => linkWaitlistRequest(ctx, { email: token.email, tokenId: token.id })));

  // No account holds these addresses (a verified one is rejected above) and no organization is involved: the mail
  // goes out in the app's language.
  await sendInvitationMails(ctx, { sender: user, invited: issued.map(({ token, rawToken }) => ({ email: token.email, rawToken })) });

  log.info('Users invited on system level', { count: issued.length });

  return { data: [] as never[], rejectedIds, invitesSentCount: issued.length };
}
