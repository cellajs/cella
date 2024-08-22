import { useTranslation } from 'react-i18next';
import type { User } from '~/types';

import { Link, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { UserRoundCheck } from 'lucide-react';
import { useState } from 'react';
import { useBreakpoints } from '~/hooks/use-breakpoints';
import { dateShort } from '~/lib/utils';
import { renderSelect } from '~/modules/common/data-table/select-column';
import { AvatarWrap } from '../../common/avatar-wrap';
import CheckboxColumn from '../../common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '../../common/data-table/columns-view';
import HeaderCell from '../../common/data-table/header-cell';
import UpdateRow from './update-row';
import { openUserPreviewSheet } from '~/modules/common/data-table/util';
import { impersonateSignIn } from '~/api/auth';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import type { MeUser } from '~/types';
import { getAndSetMe, getAndSetMenu } from '~/routes';

export const useColumns = (callback: (users: User[], action: 'create' | 'update' | 'delete') => void) => {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);
  const navigate = useNavigate();
  const isMobile = useBreakpoints('max', 'sm');
  const columns: ColumnOrColumnGroup<User>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('common:name'),
      visible: true,
      sortable: true,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row, tabIndex }) => (
        <div className="inline-flex justify-between items-center w-full">
          <Link
            to="/user/$idOrSlug"
            tabIndex={tabIndex}
            params={{ idOrSlug: row.slug }}
            className="flex space-x-2 items-center outline-0 ring-0 group"
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey) return;
              e.preventDefault();
              navigate({
                replace: true,
                resetScroll: false,
                search: (prev) => ({
                  ...prev,
                  ...{ userIdPreview: row.id },
                }),
              });
              openUserPreviewSheet(row);
            }}
          >
            <AvatarWrap type="user" className="h-8 w-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
            <span className="group-hover:underline underline-offset-4 truncate font-medium">{row.name || '-'}</span>
          </Link>
          {user.id !== row.id && (
            <Button
              variant="link"
              size="micro"
              onClick={async () => {
                useUserStore.setState({ user: null as unknown as MeUser });
                await impersonateSignIn(row.id);
                navigate({ to: '/', replace: true });
                await Promise.all([getAndSetMe(), getAndSetMenu()]);
              }}
            >
              {t('common:impersonate')}
            </Button>
          )}
        </div>
      ),
    },
    {
      key: 'edit',
      name: '',
      visible: true,
      width: 32,
      renderCell: ({ row, tabIndex }) => <UpdateRow user={row} tabIndex={tabIndex} callback={callback} />,
    },
    {
      key: 'email',
      name: t('common:email'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      minWidth: 140,
      renderCell: ({ row, tabIndex }) => {
        return (
          <a href={`mailto:${row.email}`} tabIndex={tabIndex} className="truncate hover:underline underline-offset-4 outline-0 ring-0 font-light">
            {row.email || '-'}
          </a>
        );
      },
    },
    {
      key: 'role',
      name: t('common:role'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => t(row.role),
      width: 100,
      renderEditCell: ({ row, onRowChange }) =>
        renderSelect({
          row,
          onRowChange,
          options: config.rolesByType.systemRoles,
        }),
    },
    {
      key: 'createdAt',
      name: t('common:created_at'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.createdAt),
      minWidth: 180,
    },
    {
      key: 'lastSeenAt',
      name: t('common:last_seen_at'),
      sortable: true,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => dateShort(row.lastSeenAt),
      minWidth: 180,
    },
    {
      key: 'membershipCount',
      name: 'Memberships',
      sortable: false,
      visible: !isMobile,
      renderHeaderCell: HeaderCell,
      renderCell: ({ row }) => (
        <>
          <UserRoundCheck className="mr-2 opacity-50" size={16} />
          {row.counts?.memberships | 0}
        </>
      ),
      width: 140,
    },
  ];
  return useState<ColumnOrColumnGroup<User>[]>(columns);
};
