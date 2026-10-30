import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { getRateLimiterInstance, getRetryAfter, refundAttempt, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';

const day = 60 * 60 * 24;
const addressLimits = { points: 1, duration: day };

/**
 * One invitation mail per address in a tenant a day. The key holds the tenant, so no other tenant can spend the window
 * first and keep a real invitation from going out; it holds the address, not the row, so withdrawing and inviting again
 * stays inside it.
 */
const addressMails = getRateLimiterInstance({ keyPrefix: 'invitationMailAddress', ...addressLimits, inMemoryBlock: false });

/** A tenant's invitation mails a day, against its `invitationMailsPerDay` restriction, so admin accounts do not multiply it. */
const tenantMails = getRateLimiterInstance({ keyPrefix: 'invitationMailTenant', points: 1, duration: day, inMemoryBlock: false });

const addressKey = (tenantId: string, email: string) => subjectSegment('tenantId', tenantId) + subjectSegment('email', email);

interface TakeInvitationMailsInput {
  /** The addresses an inviter's request mails now. */
  mailNow: string[];
  /** Invitations held for a draft's publish, which mails each once: they count toward the tenant's total now. */
  mailAtPublish?: number;
}

/**
 * Takes the invitation mails an inviter's request is about to send from both caps, before any row is written. An
 * address the tenant mailed in the last day is held back and costs the tenant nothing; the rest count toward the
 * tenant's day.
 * @returns The addresses held back: they get no mail and no new link, so a link already sent keeps working.
 * @throws AppError 429 `invitation_limit_reached` with `meta.retryAfter` in seconds when the tenant's day cannot hold
 *   the mails; nothing is taken then.
 */
export async function takeInvitationMails(ctx: ActorContext, { mailNow, mailAtPublish = 0 }: TakeInvitationMailsInput): Promise<Set<string>> {
  const { tenantId, tenant } = ctx.var;

  const reservations = await Promise.all(
    mailNow.map(async (email) => ({ email, reservation: await reserveAttempt(addressMails, addressKey(tenantId, email), addressLimits) })),
  );
  const heldBack = new Set(reservations.flatMap(({ email, reservation }) => (reservation.granted ? [] : [email])));

  const count = mailNow.length - heldBack.size + mailAtPublish;
  const budget = tenant.restrictions.rateLimits.invitationMailsPerDay;
  if (!count || budget === 0) return heldBack;

  const total = await reserveAttempt(tenantMails, tenantId, { points: budget, duration: day }, count);
  if (total.granted) return heldBack;

  for (const { email, reservation } of reservations) {
    if (reservation.granted) await refundAttempt(reservation.store, addressKey(tenantId, email));
  }
  throw new AppError(429, 'invitation_limit_reached', 'warn', { meta: { retryAfter: getRetryAfter(total.state.msBeforeNext) } });
}
