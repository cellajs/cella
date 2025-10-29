import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import {
  type ApiError,
  type GetMyInvitationsResponse,
  HandleMembershipInvitationData,
  type HandleMembershipInvitationResponse,
  handleMembershipInvitation,
} from '~/api.gen';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { ExpandableList } from '~/modules/common/expandable-list';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMenu } from '~/modules/me/helpers';
import { meInvitationsQueryOptions, meKeys } from '~/modules/me/query';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';
import { UserCell } from '~/modules/users/user-cell';
import { queryClient } from '~/query/query-client';
import { getEntityRoute } from '~/routes-resolver';

/**
 * Component to show a list of pending entity invitations for the current user
 */
export const EntityInvitations = () => {
  const { t } = useTranslation();

  const queryOptions = meInvitationsQueryOptions();
  const { data: invites } = useSuspenseQuery(queryOptions);

  const { mutate: handleInvitation } = useMutation<HandleMembershipInvitationResponse, ApiError, HandleMembershipInvitationData['path']>({
    mutationFn: ({ id, acceptOrReject }) => handleMembershipInvitation({ path: { id, acceptOrReject } }),
    onSuccess: async (settledEntity, { acceptOrReject }) => {
      await getAndSetMenu();
      queryClient.setQueryData<GetMyInvitationsResponse>(meKeys.invites, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: oldData.items.filter((invite) => invite.entity.id !== settledEntity.id) };
      });

      toaster(t(`common:invitation_settled`, { action: acceptOrReject === 'accept' ? 'accepted' : 'rejected' }), 'success');
    },
  });

  if (!invites?.items.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>{t('common:pending_invitations')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <ExpandableList
            items={invites.items}
            renderItem={({ entity, createdByUser, membership }) => {
              const { to, params, search } = getEntityRoute({ ...entity, membership: null });
              const actionButtons = [
                { label: t('common:accept'), variant: 'darkSuccess', action: 'accept' },
                { label: t('common:reject'), variant: 'destructive', action: 'reject' },
              ] as const;

              return (
                <div className="flex items-center max-sm:flex-col justify-between gap-4 py-2">
                  <Link to={to} params={params} search={search} draggable="false" className="flex space-x-2 items-center outline-0 ring-0 group">
                    <AvatarWrap
                      type="organization"
                      className="h-10 w-10 group-active:translate-y-[.05rem]"
                      id={entity.id}
                      name={entity.name}
                      url={entity.thumbnailUrl}
                    />
                    <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
                      {entity.name}
                    </span>
                  </Link>
                  {createdByUser ? <UserCell user={createdByUser} tabIndex={0} /> : '-'}

                  <div className="flex gap-2 w-full max-w-50">
                    {actionButtons.map(({ label, variant, action }) => (
                      <Button
                        className="w-full"
                        key={action}
                        size="xs"
                        variant={variant}
                        onClick={() => handleInvitation({ id: membership.id, acceptOrReject: action })}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            }}
            initialDisplayCount={2}
            expandText="common:show_all_invites"
          />
        </div>
      </CardContent>
    </Card>
  );
};
