import { useMutation, useSuspenseQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AcceptMembershipData, type AcceptMembershipResponse, type ApiError, acceptMembership, type GetMyInvitationsResponse } from '~/api.gen';
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

  const { mutate: _acceptMembership } = useMutation<AcceptMembershipResponse, ApiError, AcceptMembershipData['path']>({
    mutationFn: ({ id, acceptOrReject }) => acceptMembership({ path: { id, acceptOrReject } }),
    onSuccess: async (acceptedEntity) => {
      await getAndSetMenu();
      queryClient.setQueryData<GetMyInvitationsResponse>(meKeys.invites, (oldData) => {
        if (!oldData) return oldData;
        return oldData.filter((invite) => invite.entity.id !== acceptedEntity.id);
      });
      toaster(t('common:invitation_accepted'), 'success');
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
            renderItem={({ entity, invitedBy, membership }) => {
              const { to, params, search } = getEntityRoute({ ...entity, membership: null });

              // TODO
              const isExpired = new Date(membership.createdAt as string) < new Date();
              return (
                <div className="grid grid-cols-4 col-end- items-center gap-4 py-2">
                  <Link to={to} params={params} search={search} draggable="false" className="flex space-x-2 items-center outline-0 ring-0 group">
                    <AvatarWrap
                      type="organization"
                      className="h-10 w-10 group-active:translate-y-[.05rem] group-hover:font-semibold"
                      id={entity.id}
                      name={entity.name}
                      url={entity.thumbnailUrl}
                    />
                    <span className="group-hover:underline underline-offset-3 decoration-foreground/20 group-active:decoration-foreground/50 group-active:translate-y-[.05rem] truncate font-medium">
                      {entity.name}
                    </span>
                  </Link>
                  {invitedBy ? <UserCell user={invitedBy} tabIndex={0} /> : '-'}
                  {/* TODO */}
                  <span>{isExpired ? 'Expired' : dateShort(membership.createdAt as string)}</span>
                  <Button
                    className="w-[60%] ml-auto"
                    size="xs"
                    variant="darkSuccess"
                    onClick={() => _acceptMembership({ id: membership.id, acceptOrReject: 'accept' })}
                  >
                    {t('common:accept')}
                  </Button>
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
