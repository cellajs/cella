import { BoxIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType, hierarchy, isChannel } from 'shared';
import { hiddenMemberCountColumns, memberStatIcons } from '~/members-config';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import type { Member } from '~/modules/memberships/types';
import { Badge } from '~/modules/ui/badge';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

// Product types with per-member stat columns, from config (the response only carries these keys).
// Their icons and the count columns hidden by default are app-owned in members-config.
const memberStatProductTypes = appConfig.memberStatProductTypes;

export const useColumns = (isAdmin: boolean, isSheet: boolean, entityType: ChannelEntityType) => {
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
              options={hierarchy.getRoles(entityType)}
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
      // Per-member insight columns from include=counts: when the member last posted in this
      // channel, their authored counts within it, and their sub-channel membership counts.
      {
        key: 'lastPostedAt',
        name: t('c:last_post'),
        sortable: true,
        sortDescendingFirst: true,
        minBreakpoint: 'md',
        minWidth: 120,
        placeholderValue: '-',
        renderCell: ({ row }) => {
          const lastPostedAt = row.counts?.activity[memberStatProductTypes[0]];
          return lastPostedAt ? dateShort(new Date(lastPostedAt)) : null;
        },
      },
      ...memberStatProductTypes.map((type): ColumnOrColumnGroup<Member> => {
        const Icon = memberStatIcons[type] ?? BoxIcon;
        return {
          key: `${type}Count`,
          name: t(`c:${type}`, { count: 2 }),
          hidden: hiddenMemberCountColumns.includes(type),
          minBreakpoint: 'md',
          minWidth: 60,
          maxWidth: 120,
          renderCell: ({ row }) => (
            <>
              <Icon className="mr-2 opacity-50" />
              {row.counts?.products[type] ?? '-'}
            </>
          ),
        };
      }),
      ...hierarchy
        .getOrderedDescendants(entityType)
        .filter(
          (type): type is Exclude<ChannelEntityType, 'organization'> => isChannel(type) && type !== 'organization',
        )
        .map(
          (type): ColumnOrColumnGroup<Member> => ({
            key: `${type}Count`,
            name: t(`c:${type}`, { count: 2, defaultValue: type }),
            hidden: hiddenMemberCountColumns.includes(type),
            minBreakpoint: 'md',
            minWidth: 60,
            maxWidth: 120,
            renderCell: ({ row }) => (
              <>
                <BoxIcon className="mr-2 opacity-50" />
                {row.counts?.memberships[type] ?? '-'}
              </>
            ),
          }),
        ),
    ];

    return cols;
  };

  return useState<ColumnOrColumnGroup<Member>[]>(columns);
};
