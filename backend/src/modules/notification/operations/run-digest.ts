import { baseDb } from '#/db/db';
import { mailer } from '#/lib/mailer';
import { log } from '#/utils/logger';
import { digestEmail } from '../emails/digest-email';
import { buildUnsubscribeLink } from '../helpers/category-token';
import { renderSectionsHtml } from '../helpers/render-digest-html';
import { findDueDigestRecipients, stampDigested, stampDigestRun } from '../notification-queries';
import { buildDigestForUser } from './build-digest';

/** Recipients handled per run; a backlog simply continues on the next hourly tick. */
const MAX_RECIPIENTS_PER_RUN = 500;

/** Local hour at which digests go out. No per-user timezone yet. */
const SEND_HOUR = 7;

/** Weekday for weekly digests (1 = Monday … 5 = Friday), matching the legacy Friday cadence. */
const WEEKLY_ISO_WEEKDAY = 5;

const DAY_MS = 24 * 60 * 60 * 1000;

/** Runs from the digest job, outside any request. */
const dbCtx = { var: { db: baseDb } };

/** How far back a digest window reaches at most: the cadence plus a day. */
const MAX_WINDOW_DAYS = { daily: 2, weekly: 8 };

const earliestStart = (cadence: keyof typeof MAX_WINDOW_DAYS, now: Date): Date => new Date(now.getTime() - MAX_WINDOW_DAYS[cadence] * DAY_MS);

/**
 * Where a recipient's digest window starts: at the stored `lastDigestAt`, so a late or skipped run resumes where the
 * previous one stopped, but never further back than the cadence plus a day. A first digest, and the first after the
 * digest was off, cover recent rows only, never the whole inbox. `findDueDigestRecipients` mirrors this in SQL.
 */
export const windowStart = (recipient: { digest: string; lastDigestAt: string | null }, now: Date): Date => {
  const earliest = earliestStart(recipient.digest === 'weekly' ? 'weekly' : 'daily', now).getTime();
  const last = recipient.lastDigestAt ? utcTimestamp(recipient.lastDigestAt).getTime() : earliest;
  return new Date(Math.max(last, earliest));
};

/** A `timestamp` (without zone) column value, which holds UTC: JavaScript would read the bare text as local time. */
const utcTimestamp = (value: string): Date => new Date(`${value.replace(' ', 'T')}Z`);

/**
 * One digest pass.
 *
 * Called hourly; each tick decides per user whether their digest is due. That makes it
 * idempotent and restart-proof: a missed hour is picked up by the
 * next tick, and `lastDigestAt` guarantees a user is never mailed twice for the same window.
 */
export async function runDigest(now: Date = new Date()): Promise<{ sent: number; skipped: number }> {
  if (now.getHours() < SEND_HOUR) return { sent: 0, skipped: 0 };

  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);

  const due = await findDueDigestRecipients(dbCtx, {
    dayStart: dayStart.toISOString(),
    includeWeekly: isoWeekday(now) === WEEKLY_ISO_WEEKDAY,
    earliest: { daily: earliestStart('daily', now).toISOString(), weekly: earliestStart('weekly', now).toISOString() },
    limit: MAX_RECIPIENTS_PER_RUN,
  });
  if (due.length === 0) return { sent: 0, skipped: 0 };

  let sent = 0;
  let skipped = 0;
  const processed: string[] = [];

  for (const recipient of due) {
    try {
      const content = await buildDigestForUser(recipient.userId, windowStart(recipient, now), recipient.language);

      // Skip-if-empty: weekly is on by default, so silence must stay silent.
      if (content.sections.length === 0) {
        skipped++;
        processed.push(recipient.userId);
        continue;
      }

      await mailer.prepareEmails(digestEmail, { daily: recipient.digest === 'daily' }, [
        {
          email: recipient.email,
          lng: recipient.language,
          sectionsHtml: renderSectionsHtml(content.sections, recipient.language),
          unsubscribeLink: buildUnsubscribeLink(recipient.userId, 'digest'),
        },
      ]);

      await stampDigested(dbCtx, { ids: content.notificationIds });
      processed.push(recipient.userId);
      sent++;
    } catch (error) {
      // One bad recipient must not stop the run; the window stays open and retries next tick.
      log.error('Digest failed for recipient', { error, userId: recipient.userId });
    }
  }

  // Stamped even when nothing was sent, so an empty window is not re-evaluated all day.
  await stampDigestRun(dbCtx, { userIds: processed, ranAt: now.toISOString() });

  log.info('Digest run complete', { sent, skipped, considered: due.length });
  return { sent, skipped };
}

/** ISO weekday, 1 = Monday … 7 = Sunday. */
function isoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}
