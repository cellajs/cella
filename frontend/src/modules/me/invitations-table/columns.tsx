import { useTranslation } from 'react-i18next';
import {
  ApiError,
  GetMyInvitationsResponse,
  HandleMembershipInvitationData,
  HandleMembershipInvitationResponse,
  handleMembershipInvitation,
} from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMutation } from '~/hooks/use-mutations';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import HeaderCell from '~/modules/common/data-table/header-cell';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMenu } from '~/modules/me/helpers';
import { meKeys } from '~/modules/me/query';
import { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';
import { UserCellById } from '~/modules/users/user-cell';
import { queryClient } from '~/query/query-client';
import { dateShort } from '~/utils/date-short';

export const useColumns = () => {
  const { t } = useTranslation();

  const isMobile = useBreakpoints('max', 'sm', false);

  const actionButtons = [
    { label: t('common:accept'), variant: 'darkSuccess', action: 'accept' },
    { label: t('common:reject'), variant: 'destructive', action: 'reject' },
  ] as const;

  const { mutate: handleInvitation } = useMutation<HandleMembershipInvitationResponse, ApiError, HandleMembershipInvitationData['path']>({
    mutationFn: ({ id, acceptOrReject, orgIdOrSlug }) => handleMembershipInvitation({ path: { id, acceptOrReject, orgIdOrSlug } }),
    onSuccess: async (settledEntity, { acceptOrReject }) => {
      await getAndSetMenu();
      queryClient.setQueryData<GetMyInvitationsResponse>(meKeys.invites, (oldData) => {
        if (!oldData) return oldData;
        return { ...oldData, items: oldData.items.filter((invite) => invite.entity.id !== settledEntity.id) };
      });

      toaster(t(`common:invitation_settled`, { action: acceptOrReject === 'accept' ? 'accepted' : 'rejected' }), 'success');
    },
  });

  const columns: ColumnOrColumnGroup<Invitation>[] = [
    {
      key: 'name',
      name: t('common:organization'),
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <AvatarWrap type="organization" className="h-8 w-8" id={row.entity.id} name={row.entity.name} url={row.entity.thumbnailUrl} />
          <span className="ml-2 truncate font-medium">{row.entity.name || '-'}</span>
        </>
      ),
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: false,
      visible: true,
      minWidth: 100,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <div className="inline-flex items-center gap-1 relative group h-full w-full">
          {row.inactiveMembership.role ? t(row.inactiveMembership.role, { ns: ['app', 'common'] }) : <span className="text-muted">-</span>}
        </div>
      ),
    },
    {
      key: 'createdAt',
      name: t('common:invited_at'),
      sortable: false,
      visible: !isMobile,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) =>
        row.inactiveMembership.createdAt ? dateShort(row.inactiveMembership.createdAt) : <span className="text-muted">-</span>,
    },
    {
      key: 'createdBy',
      name: t('common:invited_by'),
      sortable: false,
      visible: !isMobile,
      minWidth: 120,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => <UserCellById userId={row.inactiveMembership.createdBy} cacheOnly={false} tabIndex={tabIndex} />,
    },
    {
      key: 'actions',
      name: '',
      sortable: false,
      visible: true,
      width: 200,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <div className="flex gap-2 w-full max-w-50">
          {actionButtons.map(({ label, variant, action }) => (
            <Button
              className="w-full"
              key={action}
              size="xs"
              variant={variant}
              onClick={() =>
                handleInvitation({ id: row.inactiveMembership.id, acceptOrReject: action, orgIdOrSlug: row.inactiveMembership.organizationId })
              }
            >
              {label}
            </Button>
          ))}
        </div>
      ),
    },
  ];

  return columns;
};
