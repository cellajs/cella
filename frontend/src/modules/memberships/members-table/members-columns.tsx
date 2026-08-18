import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { roles } from 'shared';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Member } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (isAdmin: boolean, isSheet: boolean) => {
  const { t } = useTranslation();

  const columns = () => {
    const cols: ColumnOrColumnGroup<Member>[] = [
      ...(isAdmin ? [CheckboxColumn] : []),
      {
        key: 'name',
        name: t('c:name'),
        minWidth: 200,
        sortable: true,
        resizable: true,
        renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} className="font-medium" />,
      },
      {
        key: 'email',
        name: t('c:email'),
        minBreakpoint: 'md',
        resizable: true,
        minWidth: 140,
        placeholderValue: '-',
        renderCell: ({ row, tabIndex }) => {
          if (!row.email) return null;
          return (
            <a
              href={`mailto:${row.email}`}
              tabIndex={tabIndex}
              className="truncate decoration-foreground/20 underline-offset-4 outline-0 ring-0 hover:underline"
            >
              {row.email}
            </a>
          );
        },
      },
      {
        key: 'role',
        name: t('c:role'),
        sortable: true,
        resizable: true,
        placeholderValue: '-',
        renderCell: ({ row }) =>
          row.membership ? (
            <div className="group relative inline-flex h-full w-full items-center gap-1">{t(row.membership.role)}</div>
          ) : null,
        width: 100,
        ...(isAdmin && {
          editable: true,
          editorOptions: enumSelectEditorOptions,
          renderEditCell: (props) => (
            <RenderEnumSelect
              {...props}
              options={roles.all}
              currentValue={props.row.membership?.role}
              setValue={(row, role) => ({ ...row, membership: { ...row.membership, role } })}
              renderOption={(role) => t(role)}
            />
          ),
        }),
      },
      {
        key: 'createdAt',
        name: t('c:created_at'),
        sortable: true,
        sortDescendingFirst: true,
        hidden: isSheet,
        minBreakpoint: 'md',
        minWidth: 120,
        placeholderValue: '-',
        renderCell: ({ row }) => dateShort(row.createdAt),
      },
      {
        key: 'lastSeenAt',
        name: t('c:last_seen_at'),
        sortable: true,
        minBreakpoint: 'md',
        minWidth: 120,
        placeholderValue: '-',
        // An empty lastSeenAt means the member never signed in, which the badge states explicitly
        renderCell: ({ row }) =>
          row.lastSeenAt ? (
            dateShort(row.lastSeenAt)
          ) : (
            <Badge variant="secondary" size="xs">
              {t('c:inactive')}
            </Badge>
          ),
      },
    ];

    return cols;
  };

  return useState<ColumnOrColumnGroup<Member>[]>(columns);
};
