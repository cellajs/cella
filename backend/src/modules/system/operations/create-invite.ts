import type { UserContext } from '#/core/context';
import { issueTokens } from '#/modules/auth/tokens/token-lifecycle';
import { findSystemInvitationTokens } from '#/modules/auth/tokens/tokens-queries';
import { sendInvitationMails } from '#/modules/memberships/operations/invitation-mail';
import { stampWaitlistRequestInvited } from '#/modules/requests/requests-queries';
import { findVerifiedEmails } from '#/modules/system/system-queries';
import { log } from '#/utils/logger';

export async function createInviteOp(ctx: UserContext, emails: string[]) {
  const user = ctx.var.user;
  // The body schema trims and lowercases each address; the set drops repeats.
  const uniqueEmails = [...new Set(emails)];
  const now = new Date();

  const verifiedEmails = await findVerifiedEmails(ctx, { emails: uniqueEmails });
  const pendingTokens = await findSystemInvitationTokens(ctx, { emails: uniqueEmails });

  // An address a verified account holds, or one with an unexpired invitation, is rejected; an expired one is invited again.
  const taken = new Set([
    ...verifiedEmails.map((row) => row.email),
    ...pendingTokens.filter((token) => new Date(token.expiresAt) > now).map((token) => token.email),
  ]);
  const recipientEmails = uniqueEmails.filter((email) => !taken.has(email));
  const rejectedIds = uniqueEmails.filter((email) => taken.has(email));

  if (recipientEmails.length === 0) return { data: [], rejectedIds, invitesSentCount: 0 };

  // One independent random secret per recipient, so one link never authenticates another's invitation. Each replaces
  // the earlier system invitations of its address.
  const issued = await issueTokens(
    ctx,
    recipientEmails.map((email) => ({ type: 'invitation' as const, email, createdBy: user.id })),
  );

  await Promise.all(issued.map(({ token }) => stampWaitlistRequestInvited(ctx, { email: token.email })));

  // No account holds these addresses (a verified one is rejected above) and no organization is involved: the mail
  // goes out in the app's language.
  const invited = issued.map(({ token, rawToken }) => ({ email: token.email, rawToken }));
  await sendInvitationMails(ctx, { sender: user, invited });

  log.info('Users invited on system level', { count: issued.length });

  return { data: [], rejectedIds, invitesSentCount: issued.length };
}
