import { useTranslation } from 'react-i18next';
import { ApiError, GetMyInvitationsResponse, handleMembershipInvitation, HandleMembershipInvitationData, HandleMembershipInvitationResponse } from '~/api.gen';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { useMutation } from '~/hooks/use-mutations';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import HeaderCell from '~/modules/common/data-table/header-cell';
// import TableEllipsis, { type EllipsisOption } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
// import { PopConfirm } from '~/modules/common/popconfirm';
import { toaster } from '~/modules/common/toaster/service';
import { UserCellById } from '~/modules/users/user-cell';
import { queryClient } from '~/query/query-client';
import { dateShort } from '~/utils/date-short';
import { getAndSetMenu } from '../helpers';
import { meKeys } from '../query';
import { Button } from '~/modules/ui/button';
import { Invitation } from '../types';

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
      name: t('common:name'),
      visible: true,
      sortable: false,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <AvatarWrap
            type="organization"
            className="h-8 w-8"
            id={row.entity.id}
            name={row.entity.name}
            url={row.entity.thumbnailUrl}
          />
          <span className="ml-2 truncate font-medium">
            {row.entity.name || '-'}
          </span>
        </>
      ),
    },
    // {
    //   key: 'ellipsis',
    //   name: '',
    //   visible: isMobile,
    //   sortable: false,
    //   width: 32,
    //   renderCell: ({ row, tabIndex }) => {

    //     const ellipsisOptions: EllipsisOption<Invitation>[] = [
    //       {
    //         label: i18n.t('common:delete'),
    //         icon: TrashIcon,
    //         onSelect: (row) => {
    //           const { update } = useDropdowner.getState();
    //           const callback = () => useDropdowner.getState().remove();

    //           update({
    //             content: (
    //               <PopConfirm title={i18n.t('common:delete_confirm.text', { name: row.name })}>
    //                 klk
    //               </PopConfirm>
    //             ),
    //           });
    //         },
    //       },
    //     ];

    //     return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
    //   },
    // },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: false,
      visible: !isMobile,
      minWidth: 160,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (row.inactiveMembership.createdAt ? dateShort(row.inactiveMembership.createdAt) : <span className="text-muted">-</span>),
    },
    {
      key: 'createdBy',
      name: t('common:created_by'),
      sortable: false,
      visible: false,
      minWidth: 120,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => <UserCellById userId={row.inactiveMembership.createdBy} cacheOnly={true} tabIndex={tabIndex} />,
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
              onClick={() => handleInvitation({ id: row.inactiveMembership.id, acceptOrReject: action, orgIdOrSlug: row.inactiveMembership.organizationId })}
            >
              {label}
            </Button>
          ))}
        </div>
      ),
    }
  ];

  return columns;
};
