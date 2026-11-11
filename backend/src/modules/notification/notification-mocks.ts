import { faker } from '@faker-js/faker';
import type { ProductEntityType } from 'shared';
import { homeChannelOf } from '#/db/utils/home-channel';
import type { NotificationSubjectRow } from '#/lib/module';
import type { InsertNotificationModel } from '#/modules/notification/notification-db';
import type { NotificationKind } from '#/modules/notification/notification-kinds';

const dayMs = 24 * 60 * 60 * 1000;

/** Share of seeded rows marked read; the rest keep the badge count non-zero. */
const readProbability = 0.4;

/**
 * A seed notification dated shortly after its subject but never older than 14 days: old-seeded subjects still produce
 * a recent-looking inbox, and rows fall in live partitions, well inside `retention.activityDays` (90 by default).
 */
function seedNotificationDate(subjectAt: string): string {
  const base = Math.max(Date.parse(subjectAt), Date.now() - 14 * dayMs);
  const jitter = faker.number.int({ min: 60_000, max: 6 * 60 * 60_000 });
  return new Date(Math.min(base + jitter, Date.now())).toISOString();
}

/**
 * An inbox row for a seeded subject, shaped as the fan-out would write it: home channel is the
 * deepest non-null ancestor, `seed:<subjectId>` is the activity id the seed finds its rows by, and `emailedAt` is
 * stamped on every row, whatever its kind, so no digest mails seeded activity. Seed scripts skip the actor themselves;
 * this only shapes the row.
 */
export function mockSeedNotification(
  productType: ProductEntityType,
  subject: NotificationSubjectRow & { tenantId: string; createdAt: string },
  kind: NotificationKind,
  userId: string,
  actorId: string | null,
): InsertNotificationModel {
  const home = homeChannelOf(productType, subject);
  const createdAt = seedNotificationDate(subject.createdAt);
  return {
    userId,
    actorId,
    kind,
    productType,
    subjectId: subject.id,
    contextId: subject.id,
    channelId: home.id,
    channelType: home.type,
    organizationId: subject.organizationId,
    tenantId: subject.tenantId,
    activityId: `seed:${subject.id}`,
    createdAt,
    readAt: faker.datatype.boolean({ probability: readProbability }) ? createdAt : null,
    emailedAt: createdAt,
  };
}
