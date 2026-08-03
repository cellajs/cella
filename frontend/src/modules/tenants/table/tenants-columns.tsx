import { Link } from '@tanstack/react-router';
import { GlobeIcon, PencilIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TenantWithOrganization } from 'sdk';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { type EllipsisOption, TableEllipsis } from '~/modules/common/data-table/table-ellipsis';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useDropdowner } from '~/modules/common/dropdowner/use-dropdowner';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { openUpdateSheet } from '~/modules/tenants/table/update-row';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';

const statusOptions = ['active', 'suspended', 'archived'] as const;

/**
 * Column configuration for the tenants table.
 */
export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<TenantWithOrganization>[] = [
    {
      key: 'id',
      name: t('c:id'),
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => <code className="font-mono text-xs">{row.id}</code>,
    },
    {
      // 1 tenant = 1 organization: link to the org it holds (avatar + name), or flag it as unlinked.
      key: 'organization',
      name: t('c:organization'),
      resizable: true,
      minWidth: 200,
      renderCell: ({ row, tabIndex }) => {
        const org = row.organization;
        if (!org) return <Badge variant="plain">{t('c:not_linked')}</Badge>;
        return (
          <Button
            variant="cell"
            size="cell"
            render={
              <Link
                to="/$tenantId/$organizationSlug/organization/members"
                draggable={false}
                tabIndex={tabIndex}
                params={{ tenantId: row.id, organizationSlug: org.slug }}
              />
            }
          >
            <EntityAvatar
              type="organization"
              className="h-8 w-8 group-active:translate-y-[.05rem]"
              id={org.id}
              name={org.name}
              url={org.thumbnailUrl}
            />
            <span className="truncate font-medium decoration-foreground/20 underline-offset-3 group-hover:underline group-active:translate-y-[.05rem] group-active:decoration-foreground/50">
              {org.name || '-'}
            </span>
          </Button>
        );
      },
    },
    {
      key: 'status',
      name: t('c:status'),
      resizable: true,
      width: 100,
      editable: true,
      editorOptions: enumSelectEditorOptions,
      renderCell: ({ row }) => {
        const variant = row.status === 'active' ? 'success' : row.status === 'suspended' ? 'warning' : 'plain';
        return <Badge variant={variant}>{t(`c:${row.status}`)}</Badge>;
      },
      renderEditCell: (props) => (
        <RenderEnumSelect
          {...props}
          field="status"
          options={statusOptions}
          renderOption={(status) => t(`c:${status}`)}
        />
      ),
    },
    {
      key: 'name',
      name: t('c:name'),
      sortable: true,
      resizable: true,
      minWidth: 180,
      placeholderValue: '-',
    },
    {
      key: 'ellipsis',
      name: '',
      width: 32,
      renderCell: ({ row, tabIndex }) => {
        const ellipsisOptions: EllipsisOption<TenantWithOrganization>[] = [
          {
            label: t('c:edit'),
            icon: PencilIcon,
            onSelect: (row: TenantWithOrganization, triggerRef: React.RefObject<HTMLButtonElement | null>) => {
              useDropdowner.getState().remove();
              openUpdateSheet(row, triggerRef);
            },
          },
        ];

        return <TableEllipsis row={row} tabIndex={tabIndex} options={ellipsisOptions} />;
      },
    },
    {
      key: 'subscriptionStatus',
      name: t('c:subscription'),
      minBreakpoint: 'md',
      width: 140,
      placeholderValue: '-',
      renderCell: ({ row }) => {
        if (row.subscriptionStatus === 'none') return null;
        const variantMap: Record<string, 'success' | 'default' | 'destructive' | 'secondary'> = {
          active: 'success',
          trialing: 'default',
          past_due: 'destructive',
        };
        return (
          <Badge variant={variantMap[row.subscriptionStatus] ?? 'secondary'} soft>
            {t(`c:${row.subscriptionStatus}`)}
          </Badge>
        );
      },
    },
    {
      key: 'domainsCount',
      name: t('c:domain_other'),
      minBreakpoint: 'md',
      width: 100,
      renderCell: ({ row }) => (
        <>
          <GlobeIcon className="mr-2 opacity-50" />
          {row.domainsCount ?? 0}
        </>
      ),
    },
    {
      key: 'createdAt',
      name: t('c:created_at'),
      sortable: true,
      sortDescendingFirst: true,
      minBreakpoint: 'md',
      minWidth: 120,
      placeholderValue: '-',
      renderCell: ({ row }) => dateShort(row.createdAt),
    },
  ];

  return useState<ColumnOrColumnGroup<TenantWithOrganization>[]>(columns);
};
