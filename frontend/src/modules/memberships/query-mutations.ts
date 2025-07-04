import { useMutation } from '@tanstack/react-query';
import { config } from 'config';
import { t } from 'i18next';
import { deleteMemberships, type MembershipInviteResponse, membershipInvite, updateMembership } from '~/api.gen';
import type { ApiError } from '~/lib/api';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMenu } from '~/modules/me/helpers';
import { resolveParentEntityType } from '~/modules/memberships/helpers';
import { membersKeys } from '~/modules/memberships/query';
import type {
  DeleteMembership,
  EntityMembershipContextProp,
  InfiniteMemberQueryData,
  InviteMember,
  Member,
  MemberContextProp,
  MemberQueryData,
  Membership,
  MutationUpdateMembership,
} from '~/modules/memberships/types';
import { updateMenuItemMembership } from '~/modules/navigation/menu-sheet/helpers/menu-operations';
import { formatUpdatedData, getQueryItems, getSimilarQueries } from '~/query/helpers/mutate-query';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';
import { queryClient } from '~/query/query-client';
import type { ContextEntityData, EntityPage } from '../entities/types';

const limit = config.requestLimits.members;

const onError = (_: ApiError, __: InviteMember | MutationUpdateMembership | DeleteMembership, context?: MemberContextProp[]) => {
  if (context?.length) {
    for (const [queryKey, previousData] of context) queryClient.setQueryData(queryKey, previousData);
  }
};

export const useInviteMemberMutation = () =>
  useMutation<MembershipInviteResponse, ApiError, InviteMember, undefined>({
    mutationKey: membersKeys.update(),
    mutationFn: ({ entity, ...body }) =>
      membershipInvite({
        body,
        query: { idOrSlug: entity.id, entityType: entity.entityType },
        path: { orgIdOrSlug: entity.organizationId || entity.id },
      }),
    onSuccess: () => toaster(t('common:success.user_invited'), 'success'),
    onError,
  });

export const useMemberUpdateMutation = () =>
  useMutation<Membership, ApiError, MutationUpdateMembership, EntityMembershipContextProp>({
    mutationKey: membersKeys.update(),
    mutationFn: async ({ id, orgIdOrSlug, entityType, idOrSlug, ...body }) => {
      return await updateMembership({ body, path: { id, orgIdOrSlug } });
    },
    onMutate: async (variables) => {
      const { idOrSlug, entityType, orgIdOrSlug, ...membershipInfo } = variables;
      const { archived, muted, role, order } = membershipInfo;

      // Store previous query data for rollback if an Apierror occurs
      const context = { queryContext: [] as MemberContextProp[], toastMessage: t('common:success.update_item', { item: t('common:membership') }) };

      if (archived !== undefined) {
        context.toastMessage = t(`common:success.${archived ? 'archived' : 'restore'}_resource`, { resource: t(`common:${entityType}`) });
      } else if (muted !== undefined) {
        context.toastMessage = t(`common:success.${muted ? 'mute' : 'unmute'}_resource`, { resource: t(`common:${entityType}`) });
      } else if (role) {
        context.toastMessage = t('common:success.update_item', { item: t('common:role') });
      } else if (order !== undefined) context.toastMessage = t('common:success.update_item', { item: t('common:order') });

      // Update membership of ContextEntityType query that was fetched
      const queryKey = resolveParentEntityType(idOrSlug, entityType);
      const { updateMembership } = useMutateQueryData(queryKey);
      updateMembership([membershipInfo], entityType);

      // To be able update menu offline
      updateMenuItemMembership(membershipInfo, idOrSlug, entityType);

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, membershipInfo);

          return formatUpdatedData(oldData, updatedData, limit);
        });

        context.queryContext.push([queryKey, previousData, membershipInfo.id]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: async (updatedMembership, { idOrSlug, entityType, orgIdOrSlug }, { toastMessage }) => {
      // Update membership of ContextEntityType query that was fetched after success
      const queryKey = resolveParentEntityType(idOrSlug, entityType);
      const { updateMembership } = useMutateQueryData(queryKey);
      updateMembership([updatedMembership], entityType);

      // To update membership after success
      updateMenuItemMembership(updatedMembership, idOrSlug, entityType);

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
      //Cancel all affected queries
      const queries = getSimilarQueries<Member>(similarKey);

      for (const query of queries) {
        const [activeKey] = query;

        // if role changes invalidate role based filter
        if (updatedMembership.role && activeKey.some((el) => typeof el === 'object' && el && 'role' in el && el.role)) {
          queryClient.invalidateQueries({ queryKey: activeKey });
          continue;
        }

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(activeKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedData = updateMembers(prevItems, updatedMembership);

          return formatUpdatedData(oldData, updatedData, limit);
        });
      }
      toaster(toastMessage, 'success');
    },
    onError: (_, __, context) => {
      getAndSetMenu();
      onError(_, __, context?.queryContext);
    },
  });

export const useMembersDeleteMutation = () =>
  useMutation<void, ApiError, DeleteMembership, MemberContextProp[]>({
    mutationKey: membersKeys.delete(),
    mutationFn: async ({ idOrSlug, entityType, orgIdOrSlug, members }) => {
      const ids = members.map(({ id }) => id);
      await deleteMemberships({ query: { idOrSlug, entityType }, body: { ids }, path: { orgIdOrSlug } });
    },
    onMutate: async (variables) => {
      const { members, idOrSlug, entityType, orgIdOrSlug } = variables;
      const ids = members.map(({ id }) => id);

      const context: MemberContextProp[] = []; // previous query data for rollback if an Apierror occurs

      // Get affected queries
      const similarKey = membersKeys.table.similarMembers({ idOrSlug, entityType, orgIdOrSlug });
      //Cancel all affected queries
      await queryClient.cancelQueries({ queryKey: similarKey });
      const queries = getSimilarQueries<Member>(similarKey);

      // Iterate over affected queries and optimistically update cache
      for (const [queryKey, previousData] of queries) {
        if (!previousData) continue;

        queryClient.setQueryData<InfiniteMemberQueryData | MemberQueryData>(queryKey, (oldData) => {
          if (!oldData) return oldData;

          const prevItems = getQueryItems(oldData);
          const updatedMemberships = deletedMembers(prevItems, ids);

          return formatUpdatedData(oldData, updatedMemberships, limit, -ids.length);
        });

        context.push([queryKey, previousData]); // Store previous data for rollback if needed
      }

      return context;
    },
    onSuccess: () => toaster(t('common:success.delete_members'), 'success'),
    onError,
  });

const updateMembers = (members: Member[], variables: Omit<MutationUpdateMembership, 'idOrSlug' | 'entityType' | 'orgIdOrSlug'>) => {
  return members.map((member) => {
    // Update the task itself
    if (member.membership.id === variables.id) return { ...member, membership: { ...member.membership, ...variables } };

    // No changes, return member as-is
    return member;
  });
};

const deletedMembers = (members: Member[], ids: string[]) => {
  return members
    .map((member) => {
      if (ids.includes(member.id)) return null;
      return member;
    })
    .filter(Boolean) as Member[];
};

export const handlePendingInvites = (targetEntity: ContextEntityData, organization: ContextEntityData, invitesCount: number) => {
  const { id, slug, entityType } = targetEntity;
  // If the entity is not an organization but belongs to one, update its cache too
  if (entityType !== 'organization') {
    const { id: orgId, slug: orgSlug, entityType: orgEntityType } = organization;
    queryClient.setQueryData<EntityPage>([orgEntityType, orgId], (data) => updateInvitesCount(data, invitesCount));
    queryClient.setQueryData<EntityPage>([orgEntityType, orgSlug], (data) => updateInvitesCount(data, invitesCount));

    queryClient.invalidateQueries({ queryKey: membersKeys.table.pending({ idOrSlug: orgSlug, entityType: orgEntityType, orgIdOrSlug: orgId }) });
  }

  // Try cache update for both id and slug
  queryClient.setQueryData<EntityPage>([entityType, id], (data) => updateInvitesCount(data, invitesCount));
  queryClient.setQueryData<EntityPage>([entityType, slug], (data) => updateInvitesCount(data, invitesCount));

  queryClient.invalidateQueries({ queryKey: membersKeys.table.pending({ idOrSlug: slug, entityType, orgIdOrSlug: organization.id }) });
};
const updateInvitesCount = (oldEntity: EntityPage | undefined, updateCount: number) => {
  if (!oldEntity) return oldEntity;
  // Ensure invitesCount is a number, add emails.length
  const currentCount = typeof oldEntity.invitesCount === 'number' ? oldEntity.invitesCount : 0;
  return { ...oldEntity, invitesCount: currentCount + updateCount };
};
