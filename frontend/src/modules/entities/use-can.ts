import { useQuery } from '@tanstack/react-query';
import type { ActorRef, MembershipBase } from 'sdk';
import {
  type Access,
  archiveVeto,
  buildPeopleSubject,
  buildSubject,
  buildSubjectFromEntity,
  type ChannelEntityType,
  checkAccess,
  type EntityActionType,
  type EntityType,
  hierarchy,
  type ProductEntityType,
  type SubjectForPermission,
} from 'shared';
import { asRecord } from 'shared/utils/as-record';
import { myMembershipsQueryOptions } from '~/modules/me/query';
import { userStore, useUserStore } from '~/modules/user/user-store';
import { findInCache } from '~/query/basic/find-in-list-cache';
import { queryClient } from '~/query/query-client';

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
 * at the channel `row` is; for `user`, the people of the channel `row` is. Null when `entityType` has no place under
 * that channel.
 * @throws MissingAncestorError when the row lacks an ancestor id column
 */
export const canSubject = (entityType: EntityType, row: CanRow): SubjectForPermission | null => {
  const columns = asRecord(row);
  if (entityType === 'user') return hierarchy.isChannel(row.entityType) ? buildPeopleSubject(row.entityType, { ...columns, id: row.id }) : null;
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

/**
 * Whether `access` may take `action` on `row`, or on a new `entityType` row homed at the channel `row` is: the engine's
 * answer without the archive veto, for route guards and code outside React.
 */
export const canAccess = (access: Access, action: EntityActionType, entityType: EntityType, row: CanRow): boolean => {
  const subject = canSubject(entityType, row);
  return !!subject && checkAccess(access, action, subject).allowed;
};

/** The signed-in user's access over their memberships; no user is a visitor. */
export const userAccess = (user: { id: string } | null, isSystemAdmin: boolean, memberships: MembershipBase[]): Access =>
  user ? { actorId: user.id, isSystemAdmin, scopes: null, memberships } : { visitor: true };

/**
 * Asks the permission engine what the user may do, by their memberships in `meKeys.memberships`; the backend decides.
 * A write in an archived channel is denied, as the server refuses it to everyone (`archiveVeto`); `ignoreArchive` asks
 * about the grants alone, for the controls that unarchive. `asMember` answers by the memberships alone, as the Yjs relay
 * authorizes a session, with no system-admin bypass.
 * A signed-in user is denied until the memberships load; without a user it asks as anonymous and fetches none.
 */
export function useCan({ asMember, ignoreArchive }: { asMember?: boolean; ignoreArchive?: boolean } = {}) {
  const user = useUserStore((state) => state.user);
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const { data: myMemberships } = useQuery({ ...myMembershipsQueryOptions(), enabled: !!user });

  /** Whether the user may take `action` on `row`, or on a new `entityType` row homed at the channel `row` is; `read` on `user` reads its people. */
  return (action: EntityActionType, entityType: EntityType, row: CanRow): boolean => {
    if (user && !myMemberships) return false;
    if (!canAccess(userAccess(user, isSystemAdmin && !asMember, myMemberships?.results ?? []), action, entityType, row)) return false;
    if (ignoreArchive) return true;
    const subject = canSubject(entityType, row);
    return !!subject && !archiveVeto(action, subject, archivedChannelIds(row));
  };
}

/**
 * The signed-in user's access over their memberships, which it reads itself: on a cold load they may not be cached yet.
 * Null where they cannot be read (offline with none cached): the caller then lets the user through and the server decides.
 */
export async function currentAccess(): Promise<Access | null> {
  const memberships = await queryClient.query({ ...myMembershipsQueryOptions(), staleTime: 'static' }).then(
    ({ results }) => results,
    () => null,
  );
  if (!memberships) return null;
  const { user, isSystemAdmin } = userStore.getState();
  return userAccess(user, isSystemAdmin, memberships);
}
