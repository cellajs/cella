import { faker } from '@faker-js/faker';
import { hierarchy, isChannel, type ProductEntityType } from 'shared';
import type { NotificationSubjectRow } from '#/lib/module';
import type { InsertNotificationModel } from '#/modules/notification/notification-db';
import type { NotificationType } from '#/modules/notification/notification-types';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Share of seeded rows marked read; the rest keep the badge count non-zero. */
const READ_PROBABILITY = 0.4;

/**
 * A seed notification dated shortly after its subject but never older than 14 days: old-seeded
 * subjects still produce a recent-looking inbox, and rows land in live pg_partman partitions
 * well inside the 90-day retention.
 */
const seedNotificationDate = (subjectAt: string) => {
  const base = Math.max(Date.parse(subjectAt), Date.now() - 14 * DAY_MS);
  const jitter = faker.number.int({ min: 60_000, max: 6 * 60 * 60_000 });
  return new Date(Math.min(base + jitter, Date.now())).toISOString();
};

/**
 * An inbox row for a seeded subject, shaped as the fan-out would write it: home channel is the
 * deepest non-null ancestor, `seed:<subjectId>` is the dedupe activity id, `digestedAt` (and
 * `emailedAt` on mentions) is stamped so the digest and instant-email jobs never mail seeded
 * activity. Seed scripts skip the actor themselves; this only shapes the row.
 */
export function mockSeedNotification(
  entityType: ProductEntityType,
  subject: NotificationSubjectRow & { tenantId: string; createdAt: string },
  type: NotificationType,
  userId: string,
  actorId: string | null,
): InsertNotificationModel {
  const [deepest] = hierarchy.resolveNonNullAncestors(entityType, subject);
  const home =
    deepest && isChannel(deepest.type)
      ? { id: deepest.id, type: deepest.type }
      : { id: subject.organizationId, type: 'organization' as const };
  const createdAt = seedNotificationDate(subject.createdAt);
  return {
    userId,
    actorId,
    type,
    entityType,
    subjectId: subject.id,
    contextId: subject.id,
    channelId: home.id,
    channelType: home.type,
    organizationId: subject.organizationId,
    tenantId: subject.tenantId,
    activityId: `seed:${subject.id}`,
    createdAt,
    readAt: faker.datatype.boolean({ probability: READ_PROBABILITY }) ? createdAt : null,
    digestedAt: createdAt,
    emailedAt: type === 'mention' ? createdAt : null,
  };
}
