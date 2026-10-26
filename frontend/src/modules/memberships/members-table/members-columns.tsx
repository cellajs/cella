import { ShieldCheckIcon, ShieldMinusIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType, hierarchy, isChannel } from 'shared';
import { getMemberStatIcon, isMemberCountHidden } from '~/lib/entity-modules';
import { exportDate } from '~/lib/export';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { countColumn, dateColumn, emailColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import type { Member } from '~/modules/memberships/types';
import { UserCell } from '~/modules/user/user-cell';
import { dateShort } from '~/utils/date-short';

export const useColumns = (canUpdate: boolean, isSheet: boolean, entityType: ChannelEntityType) => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Member>[] = [
    ...(canUpdate ? [CheckboxColumn] : []),
    {
      key: 'name',
      name: t('c:name'),
      minWidth: 200,
      sortable: true,
      resizable: true,
      renderCell: ({ row, tabIndex }) => <UserCell user={row} tabIndex={tabIndex} className="font-medium" />,
    },
    emailColumn({ name: t('c:email'), minBreakpoint: 'md', resizable: true }),
    {
      key: 'role',
      name: t('c:role'),
      sortable: true,
      resizable: true,
      placeholderValue: '-',
      renderCell: ({ row }) => row.membership && t(row.membership.role),
      exportValue: (row) => row.membership && t(row.membership.role),
      width: 100,
      ...(canUpdate && {
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
    // From include=mfa, which the API answers for the organization's admins only: empty for anyone else
    ...(canUpdate
      ? [
          {
            key: 'mfaRequired',
            name: t('c:mfa_short'),
            minBreakpoint: 'md',
            width: 70,
            placeholderValue: '-',
            // The icon carries the state on screen; the text names it in the table tooltip and for screen readers
            renderCell: ({ row }) => {
              if (row.mfaRequired === undefined) return null;
              const label = t(row.mfaRequired ? 'c:mfa_on' : 'c:mfa_off');
              return (
                <span className="-mx-2 inline-flex h-full items-center px-2" data-tooltip="true" data-tooltip-content={label}>
                  {row.mfaRequired ? <ShieldCheckIcon className="text-success" /> : <ShieldMinusIcon className="text-destructive" />}
                  <span className="sr-only">{label}</span>
                </span>
              );
            },
            exportValue: (row) => (row.mfaRequired === undefined ? undefined : t(row.mfaRequired ? 'c:mfa_on' : 'c:mfa_off')),
          } satisfies ColumnOrColumnGroup<Member>,
        ]
      : []),
    dateColumn('createdAt', { name: t('c:created_at'), hidden: isSheet }),
    {
      key: 'lastSeenAt',
      name: t('c:last_seen_at'),
      sortable: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.lastSeenAt),
      exportValue: (row) => exportDate(row.lastSeenAt),
    },
    // From include=counts: the member's last post in this channel, their authored counts and their sub-channel memberships
    {
      key: 'lastPostedAt',
      name: t('c:last_post'),
      sortable: true,
      sortDescendingFirst: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => {
        const lastPostedAt = row.counts?.activity[appConfig.memberStatProductTypes[0]];
        return lastPostedAt ? dateShort(new Date(lastPostedAt)) : null;
      },
      exportValue: (row) => exportDate(row.counts?.activity[appConfig.memberStatProductTypes[0]]),
    },
    // The response counts these product types only; each one's icon and hidden default come from the module that owns it
    ...appConfig.memberStatProductTypes.map((type) =>
      countColumn<Member>(`${type}Count`, {
        name: t(`c:${type}`, { count: 2 }),
        icon: getMemberStatIcon(type),
        hidden: isMemberCountHidden(type),
        get: (row) => row.counts?.products[type],
      }),
    ),
    ...hierarchy
      .getOrderedDescendants(entityType)
      .filter((type): type is Exclude<ChannelEntityType, 'organization'> => isChannel(type) && type !== 'organization')
      .map((type) =>
        countColumn<Member>(`${type}Count`, {
          name: t(`c:${type}`, { count: 2, defaultValue: type }),
          hidden: isMemberCountHidden(type),
          get: (row) => row.counts?.memberships[type] as number | undefined,
        }),
      ),
  ];

  return useColumnVisibility(columns);
};
