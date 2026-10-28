import { Link } from '@tanstack/react-router';
import { PencilIcon, ShieldUserIcon, TrashIcon, UserRoundIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { hierarchy, isChannel, isProduct } from 'shared';
import { enumSelectEditorOptions, RenderEditStatus, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { cellLinkTextClass, countColumn, dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { DeleteQuestion } from '~/modules/common/popconfirm';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { ActorCell } from '~/modules/user/actor-cell';
import { cn } from '~/utils/cn';

const descendants = hierarchy.getOrderedDescendants('organization');
const lastChannel = descendants.filter(isChannel).at(-1);
const firstProduct = descendants.find(isProduct);

export const openUpdateOrganizationSheet = (organization: Organization, triggerRef: TriggerRef) =>
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
              tabIndex={tabIndex}
              params={{ tenantId: row.tenantId, organizationSlug: row.slug }}
            />
          }
        >
          <EntityAvatar type="organization" className="size-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className={cn(cellLinkTextClass, 'font-medium')}>{row.name || '-'}</span>
        </Button>
      ),
    },
    ellipsisColumn<EnrichedOrganization>(() => [
      {
        label: t('c:edit'),
        icon: PencilIcon,
        onSelect: (row, triggerRef) => {
          dropdowner.getState().remove();
          openUpdateOrganizationSheet(row, triggerRef);
        },
      },
      {
        label: t('c:delete'),
        icon: TrashIcon,
        variant: 'destructive',
        confirm: (row) => ({
          title: <DeleteQuestion resource="c:organization" name={row.name} />,
          content: <DeleteOrganizations tenantId={row.tenantId} organizations={[row]} />,
        }),
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
      renderCell: ({ row, column }) => (
        <RenderEditStatus row={row} column={column}>
          {row.membership?.role && t(row.membership.role)}
        </RenderEditStatus>
      ),
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
          renderOption={(role) => t(role)}
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
      renderCell: ({ row, tabIndex }) => row.createdBy && <ActorCell compactable actor={row.createdBy} tabIndex={tabIndex} />,
      exportValue: (row) => row.createdBy?.name,
    },
    ...hierarchy.getRoles('organization').map((role) => ({
      ...countColumn<EnrichedOrganization>(`${role}Count`, {
        name: t(`c:${role}`, { count: 2 }),
        icon: role === 'admin' ? ShieldUserIcon : UserRoundIcon,
        get: (row) => row.included.counts?.membership[role],
      }),
      maxWidth: 140,
    })),
    ...descendants.map((type) =>
      countColumn<EnrichedOrganization>(`${type}Count`, {
        name: t(`c:${type}`, { count: 2 }),
        hidden: type !== lastChannel && type !== firstProduct,
        get: (row) => (row.included.counts?.entities as Record<string, number>)?.[type],
      }),
    ),
  ];

  return useColumnVisibility(columns);
};
