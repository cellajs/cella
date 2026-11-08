import { useQuery } from '@tanstack/react-query';
import type { ActorRef, MembershipBase } from 'sdk';
import {
  type Access,
  archiveVeto,
  buildSubject,
  buildSubjectFromEntity,
  type ChannelEntityType,
  checkAccess,
  type EntityActionType,
  hierarchy,
  type ProductEntityType,
  type SubjectForPermission,
} from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { useUserStore } from '~/modules/user/user-store';
import { findInCache } from '~/query/basic/find-in-list-cache';

/** A cached channel or product row, read by its id, type, writer, archived flag and ancestor id columns. */
export type CanRow = {
  id: string;
  entityType: ChannelEntityType | ProductEntityType;
  createdBy?: Pick<ActorRef, 'id'> | null;
  archived?: boolean;
};

// A row that does not exist yet matches no membership by its id, so a fixed one spares minting one per call.
const newRowId = 'new';

/**
 * What `can` and the route guard ask about: `row` itself when it is of `entityType`, else a new `entityType` row homed
 * at the channel `row` is. Null when `entityType` has no place under that channel.
 * @throws MissingAncestorError when the row lacks an ancestor id column
 */
export const canSubject = (entityType: ChannelEntityType | ProductEntityType, row: CanRow): SubjectForPermission | null => {
  const columns = asRecord(row);
  if (row.entityType === entityType) return buildSubjectFromEntity(entityType, { ...columns, id: row.id, createdBy: row.createdBy?.id ?? null });

  const ancestorIds = hierarchy.ancestorIdsHomedAt(entityType, row.entityType, columns);
  return ancestorIds && buildSubject(entityType, ancestorIds, { id: newRowId });
};

/**
 * The archived channels a write on `row` acts in, as far as the cache knows: the row itself when it is an archived
 * channel, else the home channel of a product row when its cached row is archived. A home channel not in the cache
 * counts as live, and the server decides.
 */
export const archivedChannelIds = (row: CanRow): ReadonlySet<string> => {
  if (hierarchy.isChannel(row.entityType)) return new Set(row.archived ? [row.id] : []);

  const home = hierarchy.resolveNonNullAncestors(row.entityType, asRecord(row))[0];
  const cached = home && home.type !== 'organization' ? findInCache<CanRow>(home.type, home.id) : undefined;
  return new Set(cached?.archived ? [cached.id] : []);
};

/** The signed-in user's access over their memberships; no user is anonymous. */
export const userAccess = (user: { id: string } | null, isSystemAdmin: boolean, memberships: MembershipBase[]): Access =>
  user ? { actorId: user.id, isSystemAdmin, scopes: null, memberships } : { anonymous: true };

/**
 * Asks the permission engine what the user may do, by their memberships in `meKeys.memberships`; the backend decides.
 * A write in an archived channel is denied, as the server refuses it to everyone (`archiveVeto`); `ignoreArchive` asks
 * about the grants alone, for the controls that unarchive. `asMember` answers by the memberships alone, as the Yjs relay
 * authorizes a session, with no system-admin bypass.
 * A signed-in user is denied until the memberships load; without a user it asks as anonymous and fetches none.
 */
export function useCan({ asMember = false, ignoreArchive = false }: { asMember?: boolean; ignoreArchive?: boolean } = {}) {
  const user = useUserStore((state) => state.user);
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const { data: myMemberships } = useQuery({ ...myMembershipsQueryOptions(), enabled: !!user });

  /** Whether the user may take `action` on `row`, or on a new `entityType` row homed at the channel `row` is. */
  return (action: EntityActionType, entityType: ChannelEntityType | ProductEntityType, row: CanRow): boolean => {
    if (user && !myMemberships) return false;
    const subject = canSubject(entityType, row);
    if (!subject) return false;
    const allowed = checkAccess(userAccess(user, isSystemAdmin && !asMember, myMemberships?.results ?? []), action, subject).allowed;
    return allowed && (ignoreArchive || !archiveVeto(action, subject, archivedChannelIds(row)));
  };
}
