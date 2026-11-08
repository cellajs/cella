import { archiveVeto, type EntityActionType, type SubjectForPermission } from 'shared';
import type { Env } from '#/core/context';
import { AppError } from '#/core/error';

/** What the archive check reads: `orgGuard` sets the ids, and a context without that guard holds no archived channel. */
export interface ArchiveContext {
  var: Partial<Pick<Env['Variables'], 'archivedChannelIds'>>;
}

const noArchivedChannels: ReadonlySet<string> = new Set();

/** Whether the archive of the channel `subject` acts in refuses `action`: the bulk split's form of {@link assertNotArchived}. */
export const isArchivedFor = (ctx: ArchiveContext, action: EntityActionType, subject: SubjectForPermission): boolean =>
  archiveVeto(action, subject, ctx.var.archivedChannelIds ?? noArchivedChannels);

/**
 * Refuses a write in an archived channel, ahead of the engine and to system admins too.
 * @throws AppError 403 `channel_archived` when the channel `subject` acts in is archived (`archiveVeto`).
 */
export const assertNotArchived = (ctx: ArchiveContext, action: EntityActionType, subject: SubjectForPermission): void => {
  if (isArchivedFor(ctx, action, subject)) throw new AppError(403, 'channel_archived', 'warn', { entityType: subject.entityType });
};
