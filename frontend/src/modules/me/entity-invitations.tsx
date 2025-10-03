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
import { dateShort } from '~/utils/date-short';

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
        return oldData.filter((invite) => invite.entity.id !== settledEntity.id);
      });

      toaster(t(`common:invitation_settled`, { action: acceptOrReject === 'accept' ? 'accepted' : 'rejected' }), 'success');
    },
  });

  if (!invites?.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader className="p-4 border-b">
        <CardTitle>{t('common:pending_invitations')}</CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-4 font-medium text-sm p-2 border-b">
            <span>{t('common:entity')}</span>
            <span>{t('common:invited_by')}</span>
            <span>{t('common:expires_at')}</span>
            <span className="ml-auto">{t('common:action')}</span>
          </div>
          <ExpandableList
            items={invites}
            renderItem={({ entity, invitedBy, expiresAt, membership }) => {
              const { to, params, search } = getEntityRoute({ ...entity, membership: null });
              const actionButtons = [
                { label: t('common:accept'), variant: 'darkSuccess', action: 'accept' },
                { label: t('common:reject'), variant: 'destructive', action: 'reject' },
              ] as const;

              const isExpired = new Date(expiresAt) < new Date();
              return (
                <div className="grid grid-cols-4 col-end- items-center gap-4 py-2">
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
                  {invitedBy ? <UserCell user={invitedBy} tabIndex={0} /> : '-'}
                  <span>{isExpired ? 'Expired' : dateShort(expiresAt)}</span>

                  <div className="flex flex-col sm:flex-row gap-2 items-end justify-end">
                    {/* TODO disable on expired it will auto clean by DB, or add button request invite? */}
                    {actionButtons.map(({ label, variant, action }) => (
                      <Button
                        disabled={isExpired}
                        className="w-[40%]"
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
