import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { digestEmail } from '#/modules/notification/emails/digest-email';
import { buildUnsubscribeLink } from '#/modules/notification/helpers/category-token';
import { renderSectionsHtml } from '#/modules/notification/helpers/render-digest-html';
import { findDueDigestRecipients, stampDigestRun } from '#/modules/notification/notification-queries';
import { buildDigestForUser } from '#/modules/notification/operations/build-digest';
import { log } from '#/utils/logger';

/** Recipients handled per run; a backlog simply continues on the next hourly tick. */
const maxRecipientsPerRun = 500;

/** Time after which a run takes no further recipient and leaves them unstamped: one recipient's Brevo retries can take about 5 minutes, and the job expires at 15. */
const runBudgetMs = 8 * 60 * 1000;

/** Hour (UTC) at which digests go out, the same for every user. */
const sendHourUtc = 7;

/** Weekday for weekly digests (1 = Monday … 5 = Friday). */
const weeklyIsoWeekday = 5;

/** Runs from the digest job, outside any request. */
const dbCtx = { var: { db: baseDb } };

/**
 * One digest pass. Called hourly; each tick decides per user whether their digest is due. That makes it idempotent
 * and restart-proof: a missed hour is picked up by the next tick. A recipient's window ends at the run's start and is
 * settled by `lastDigestAt` right after their mail went out, so a failed send leaves it open for the next tick, and only
 * a crash between a send and its stamp mails one window twice.
 */
export async function runDigest(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  // The wall clock, since a test passes a `now` of its own.
  const deadline = Date.now() + runBudgetMs;
  if (now.getUTCHours() < sendHourUtc) return { sent: 0, skipped: 0 };

  const runAt = now.toISOString();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);

  const due = await findDueDigestRecipients(dbCtx, {
    runAt,
    dayStart: dayStart.toISOString(),
    includeWeekly: isoWeekday(now) === weeklyIsoWeekday,
    limit: maxRecipientsPerRun,
  });
  if (due.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;

  for (const [index, recipient] of due.entries()) {
    if (Date.now() > deadline) {
      log.warn('Digest run out of time, the rest wait for the next tick', { left: due.length - index });
      break;
    }
    try {
      const { userId, language } = recipient;
      const sections = await buildDigestForUser(dbCtx, { userId, since: recipient.windowStart, before: runAt, lng: language });

      // An empty window sends nothing (weekly is on by default) and is settled all the same, so it is not re-evaluated all day.
      if (sections.length === 0) {
        skipped++;
      } else {
        await mailer.sendEmails(digestEmail, { daily: recipient.digest === 'daily' }, [
          {
            email: recipient.email,
            lng: language,
            name: recipient.name,
            sectionsHtml: renderSectionsHtml(sections, language),
            unsubscribeLink: buildUnsubscribeLink(userId, 'digest'),
          },
        ]);
        sent++;
      }

      await stampDigestRun(dbCtx, { userId, ranAt: runAt });
    } catch (error) {
      // One bad recipient must not stop the run; the window stays open and retries next tick.
      log.error('Digest failed for recipient', { error, userId: recipient.userId });
    }
  }

  log.info('Digest run complete', { sent, skipped, considered: due.length });
  return { sent, skipped };
}

/** ISO weekday in UTC, 1 = Monday … 7 = Sunday. */
function isoWeekday(date: Date): number {
  const day = date.getUTCDay();
  return day === 0 ? 7 : day;
}
