import { Link } from '@tanstack/react-router';
import i18n from 'i18next';
import { BoxIcon, PencilIcon, ShieldIcon, TrashIcon, UserRoundIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { hierarchy, isChannel } from 'shared';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { PopConfirm } from '~/modules/common/popconfirm';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';

export const openUpdateSheet = (organization: Organization, triggerRef: TriggerRef) =>
  openEditSheet({
    id: 'update-organization',
    resource: 'c:organization',
    triggerRef,
    children: <UpdateOrganizationForm organization={organization} sheet />,
  });

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<EnrichedOrganization>[] = [
    CheckboxColumn,
    {
      key: 'name',
      name: t('c:name'),
      sortable: true,
      minWidth: 200,
      resizable: true,
      renderCell: ({ row, tabIndex }) => (
        <Button
          variant="cell"
          size="cell"
          render={
            <Link
              to="/$tenantId/$organizationSlug/organization/members"
              draggable={false}
              tabIndex={tabIndex}
              params={{ tenantId: row.tenantId, organizationSlug: row.slug }}
            />
          }
        >
          <EntityAvatar
            type="organization"
            className="h-8 w-8 group-active:translate-y-[.05rem]"
            id={row.id}
            name={row.name}
            url={row.thumbnailUrl}
          />
          <span className="truncate font-medium decoration-foreground/20 underline-offset-3 group-hover:underline group-active:translate-y-[.05rem] group-active:decoration-foreground/50">
            {row.name || '-'}
          </span>
        </Button>
      ),
    },
    ellipsisColumn<EnrichedOrganization>(() => [
      {
        label: i18n.t('c:edit'),
        icon: PencilIcon,
        onSelect: (row, triggerRef) => {
          useDropdowner.getState().remove();
          openUpdateSheet(row, triggerRef);
        },
      },
      {
        label: i18n.t('c:delete'),
        icon: TrashIcon,
        onSelect: (row) => {
          const { update } = useDropdowner.getState();
          const callback = () => useDropdowner.getState().remove();

          update({
            content: (
              <PopConfirm title={i18n.t('c:delete_confirm.text', { name: row.name })}>
                <DeleteOrganizations tenantId={row.tenantId} organizations={[row]} callback={callback} />
              </PopConfirm>
            ),
          });
        },
      },
    ]),
    {
      key: 'role',
      name: t('c:your_role'),

      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      placeholderValue: '-',
      editable: true,
      editorOptions: enumSelectEditorOptions,
      renderCell: ({ row }) => (row.membership?.role ? t(`${row.membership.role}`) : null),
      // Table rows carry the role from the cache; export rows fetched from the API carry it under `included`.
      exportValue: (row) => {
        const role = row.membership?.role ?? row.included?.membership?.role;
        return role && t(role);
      },
      renderEditCell: (props) => (
        <RenderEnumSelect
          {...props}
          options={hierarchy.getRoles('organization')}
          currentValue={props.row.membership?.role}
          setValue={(row, role) => ({
            ...row,
            membership: { ...(row.membership ?? {}), role } as EnrichedOrganization['membership'],
          })}
          renderOption={(role) => i18n.t(role)}
        />
      ),
    },

    dateColumn('createdAt', { name: t('c:created_at') }),
    {
      key: 'createdBy',
      name: t('c:created_by'),
      hidden: true,
      minWidth: 160,
      placeholderValue: '-',
      renderCell: ({ row, tabIndex }) => row.createdBy && <UserCell compactable user={row.createdBy} tabIndex={tabIndex} />,
      exportValue: (row) => row.createdBy?.name,
    },
    // Dynamic membership count columns from role config
    ...hierarchy.getRoles('organization').map((role) => ({
      key: `${role}Count`,
      exportValue: (row: EnrichedOrganization) => row.included.counts?.membership[role],
      name: t(`c:${role}`, { count: 2 }),
      minBreakpoint: 'md' as const,
      minWidth: 60,
      maxWidth: 140,
      renderCell: ({ row }: { row: EnrichedOrganization }) => (
        <>
          {role === 'admin' ? <ShieldIcon className="mr-2 opacity-50" /> : <UserRoundIcon className="mr-2 opacity-50" />}
          {row.included.counts?.membership[role] ?? '-'}
        </>
      ),
    })),
    // Dynamic entity count columns for org-scoped descendant entities
    ...(() => {
      const descendants = hierarchy.getOrderedDescendants('organization');
      const channelDescendants = descendants.filter((t) => isChannel(t));
      const productDescendants = descendants.filter((t) => !isChannel(t));
      // Context: last visible, Product: first visible
      const lastChannel = channelDescendants[channelDescendants.length - 1];
      const firstProduct = productDescendants[0];

      return descendants.map((type) => ({
        key: `${type}Count`,
        exportValue: (row: EnrichedOrganization) => (row.included.counts?.entities as Record<string, number>)?.[type],
        name: t(`c:${type}`, { count: 2 }),
        hidden: type !== lastChannel && type !== firstProduct,
        minBreakpoint: 'md' as const,
        minWidth: 60,
        maxWidth: 120,
        renderCell: ({ row }: { row: EnrichedOrganization }) => (
          <>
            <BoxIcon className="mr-2 opacity-50" />
            {(row.included.counts?.entities as Record<string, number>)?.[type] ?? '-'}
          </>
        ),
      }));
    })(),
  ];

  return useState<ColumnOrColumnGroup<EnrichedOrganization>[]>(columns);
};
