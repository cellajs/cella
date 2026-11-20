import type { ActorContext } from '#/core/context';
import { AppError } from '#/core/error';
import { getRateLimiterInstance, getRetryAfter, refundAttempt, reserveAttempt, subjectSegment } from '#/middlewares/rate-limiter/helpers';
import type { LimiterStore } from '#/middlewares/rate-limiter/types';

const day = 60 * 60 * 24;
const addressLimits = { points: 1, duration: day };

/**
 * One invitation mail per address in a tenant a day. The key holds the tenant, so no other tenant can spend the window
 * first and keep a real invitation from going out; it holds the address, not the row, so withdrawing and inviting again
 * stays inside it.
 */
const addressMails = getRateLimiterInstance({ keyPrefix: 'invitationMailAddress', ...addressLimits });

/** A tenant's invitation mails a day, against its `invitationEmailsPerDay` restriction. Admin accounts do not multiply it. */
const tenantMails = getRateLimiterInstance({ keyPrefix: 'invitationMailTenant', points: 1, duration: day });

const addressKey = (tenantId: string, email: string) => subjectSegment('tenantId', tenantId) + subjectSegment('email', email);

/** The tenant whose day the caps count. */
export type InvitationMailsContext = { var: Pick<ActorContext['var'], 'tenantId' | 'tenant'> };

interface TakeInvitationMailsInput {
  /** The addresses an inviter's request mails now. */
  mailNow: string[];
  /** Invitations held for a draft's publish, which mails each once: they count toward the tenant's total now. */
  mailAtPublish?: number;
}

/** What a take reserved: the addresses it was asked for, and those held back, which get no mail and no new link. */
export interface TakenInvitationMails {
  emails: string[];
  heldBack: Set<string>;
  /**
   * Each reserved address, and the tenant's points with a held invitation's, by the store that counted them: the
   * database's, or its in-memory insurance while the database was out. A refund goes back there.
   */
  reserved: { addresses: Map<string, LimiterStore>; tenant?: { store: LimiterStore; points: number } };
}

/** A take that reserved nothing, for mails whose caps were taken before. */
export const nothingTaken = (): TakenInvitationMails => ({ emails: [], heldBack: new Set(), reserved: { addresses: new Map() } });

/**
 * Takes the invitation mails an inviter's request is about to send from both caps, before any row is written. An
 * address the tenant mailed in the last day is held back and costs the tenant nothing; a link already sent keeps
 * working. The rest count toward the tenant's day.
 * @throws AppError 429 `invitation_limit_reached` with `meta.retryAfter` in seconds when the tenant's day cannot hold
 *   the mails; nothing is taken then.
 */
export async function takeInvitationMails(
  ctx: InvitationMailsContext,
  { mailNow, mailAtPublish = 0 }: TakeInvitationMailsInput,
): Promise<TakenInvitationMails> {
  const { tenantId, tenant } = ctx.var;

  const reservations = await Promise.all(
    mailNow.map(async (email) => ({ email, reservation: await reserveAttempt(addressMails, addressKey(tenantId, email), addressLimits) })),
  );
  const heldBack = new Set(reservations.flatMap(({ email, reservation }) => (reservation.granted ? [] : [email])));
  const addresses = new Map(reservations.flatMap(({ email, reservation }) => (reservation.granted ? [[email, reservation.store] as const] : [])));

  const count = mailNow.length - heldBack.size + mailAtPublish;
  const budget = tenant.restrictions.rateLimits.invitationEmailsPerDay;
  if (!count || budget === 'unlimited') return { emails: mailNow, heldBack, reserved: { addresses } };

  const total = await reserveAttempt(tenantMails, tenantId, { points: budget, duration: day }, count);
  if (total.granted) return { emails: mailNow, heldBack, reserved: { addresses, tenant: { store: total.store, points: count } } };

  for (const [email, store] of addresses) await refundAttempt(store, addressKey(tenantId, email));
  throw new AppError(429, 'invitation_limit_reached', 'warn', { meta: { retryAfter: getRetryAfter(total.state.msBeforeNext) } });
}

/**
 * Gives back what {@link takeInvitationMails} reserved, to the store that counted it. With `emails`, the addresses
 * among them whose mail did not go out: a resend the same day can mail them. Without, all of it, a held invitation's
 * points included, for a request that wrote nothing.
 */
export async function refundInvitationMails(ctx: InvitationMailsContext, { reserved }: TakenInvitationMails, emails?: string[]): Promise<void> {
  const { tenantId } = ctx.var;
  const given = [...reserved.addresses].filter(([email]) => !emails || emails.includes(email));
  for (const [email, store] of given) await refundAttempt(store, addressKey(tenantId, email));

  const points = emails ? given.length : (reserved.tenant?.points ?? 0);
  if (reserved.tenant && points) await refundAttempt(reserved.tenant.store, tenantId, points);
}
