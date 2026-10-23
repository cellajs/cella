import { Link } from '@tanstack/react-router';
import i18n from 'i18next';
import { PencilIcon, ShieldIcon, TrashIcon, UserRoundIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { hierarchy, isChannel, isProduct } from 'shared';
import { ConfirmText } from '~/modules/common/confirm-text';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { CheckboxColumn } from '~/modules/common/data-table/checkbox-column';
import { countColumn, dateColumn, ellipsisColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { dropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { openPopConfirm } from '~/modules/common/popconfirm';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { DeleteOrganizations } from '~/modules/organization/delete-organizations';
import type { EnrichedOrganization } from '~/modules/organization/types';
import { UpdateOrganizationForm } from '~/modules/organization/update-organization-form';
import { Button } from '~/modules/ui/button';
import { UserCell } from '~/modules/user/user-cell';

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
              draggable={false}
              tabIndex={tabIndex}
              params={{ tenantId: row.tenantId, organizationSlug: row.slug }}
            />
          }
        >
          <EntityAvatar type="organization" className="group-active/cell-button:press size-8" id={row.id} name={row.name} url={row.thumbnailUrl} />
          <span className="group-active/cell-button:press link-decoration group-active/cell-button:link-decoration-strong truncate font-medium group-hover/cell-button:underline">
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
          dropdowner.getState().remove();
          openUpdateOrganizationSheet(row, triggerRef);
        },
      },
      {
        label: i18n.t('c:delete'),
        icon: TrashIcon,
        onSelect: (row) => {
          const callback = () => dropdowner.getState().remove();
          openPopConfirm(
            <ConfirmText i18nKey="c:delete_confirm.text" values={{ name: row.name }} />,
            <DeleteOrganizations tenantId={row.tenantId} organizations={[row]} callback={callback} />,
          );
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
      ...countColumn<EnrichedOrganization>(`${role}Count`, {
        name: t(`c:${role}`, { count: 2 }),
        icon: role === 'admin' ? ShieldIcon : UserRoundIcon,
        get: (row) => row.included.counts?.membership[role],
      }),
      maxWidth: 140,
    })),
    // Dynamic entity count columns for org-scoped descendant entities
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
