import { useQuery } from '@tanstack/react-query';
import type { ActorRef, MembershipBase } from 'sdk';
import {
  type Access,
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

/** A cached channel or product row, read by its id, type, writer and ancestor id columns. */
export type CanRow = { id: string; entityType: ChannelEntityType | ProductEntityType; createdBy?: Pick<ActorRef, 'id'> | null };

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

/** The signed-in user's access over their memberships; no user is anonymous. */
export const userAccess = (user: { id: string } | null, isSystemAdmin: boolean, memberships: MembershipBase[]): Access =>
  user ? { actorId: user.id, isSystemAdmin, scopes: null, memberships } : { anonymous: true };

/**
 * Asks the permission engine what the user may do, by their memberships in `meKeys.memberships`; the backend decides.
 * `asMember` answers by the memberships alone, as the Yjs relay authorizes a session, with no system-admin bypass.
 * A signed-in user is denied until the memberships load; without a user it asks as anonymous and fetches none.
 */
export function useCan({ asMember = false }: { asMember?: boolean } = {}) {
  const user = useUserStore((state) => state.user);
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);
  const { data: myMemberships } = useQuery({ ...myMembershipsQueryOptions(), enabled: !!user });

  /** Whether the user may take `action` on `row`, or on a new `entityType` row homed at the channel `row` is. */
  return (action: EntityActionType, entityType: ChannelEntityType | ProductEntityType, row: CanRow): boolean => {
    if (user && !myMemberships) return false;
    const subject = canSubject(entityType, row);
    return !!subject && checkAccess(userAccess(user, isSystemAdmin && !asMember, myMemberships?.results ?? []), action, subject).allowed;
  };
}
