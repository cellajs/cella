import { Link } from '@tanstack/react-router';
import i18n from 'i18next';
import { Link2OffIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { isStrategyEnabled } from 'shared';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { dateColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { ConnectionsCard } from '~/modules/tenants/connections/connections-card';
import { UpdateTenantForm } from '~/modules/tenants/update-tenant-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '~/modules/ui/card';

const statusOptions = ['active', 'suspended', 'archived'] as const;

export const openUpdateSheet = (tenant: Tenant, triggerRef: TriggerRef) =>
  openEditSheet({
    id: 'update-tenant',
    resource: 'c:tenant',
    triggerRef,
    children: <UpdateTenantForm tenant={tenant} sheet />,
    after: isStrategyEnabled('sso') ? (
      <Card className="mb-20">
        <CardHeader>
          <CardTitle>{i18n.t('c:connection_other')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ConnectionsCard tenant={tenant} />
        </CardContent>
      </Card>
    ) : undefined,
  });

export const useColumns = () => {
  const { t } = useTranslation();

  const columns: ColumnOrColumnGroup<Tenant>[] = [
    {
      key: 'id',
      name: t('c:id'),
      minBreakpoint: 'md',
      resizable: true,
      width: 100,
      renderCell: ({ row }) => <code className="font-mono text-xs">{row.id}</code>,
    },
    {
      // The name opens the edit sheet, where the tenant and its connections are managed.
      key: 'name',
      name: t('c:name'),
      sortable: true,
      resizable: true,
      minWidth: 180,
      // Narrow enough on mobile for the three columns to fit a phone without sideways scroll.
      modes: { mobile: { minWidth: 120 } },
      renderCell: ({ row, tabIndex }) => (
        <Button variant="cell" size="cell" tabIndex={tabIndex} onClick={(event) => openUpdateSheet(row, { current: event.currentTarget })}>
          <span className="group-active/cell-button:press link-decoration group-active/cell-button:link-decoration-strong truncate font-medium group-hover/cell-button:underline">
            {row.name || '-'}
          </span>
        </Button>
      ),
    },
    {
      // 1 tenant = 1 organization: link to the org it holds (avatar + name), or flag it as unlinked.
      // On mobile the column narrows to the avatar; header and names stay readable to a screen reader.
      key: 'organization',
      name: t('c:organization'),
      resizable: true,
      minWidth: 200,
      modes: { mobile: { width: 56, minWidth: 56 } },
      headerCellClass: 'max-sm:*:sr-only',
      renderCell: ({ row, tabIndex }) => {
        const org = row.organization;
        if (!org) {
          return (
            <Badge variant="plain">
              <Link2OffIcon className="sm:hidden" />
              <span className="max-sm:sr-only">{t('c:not_linked')}</span>
            </Badge>
          );
        }
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
            <EntityAvatar type="organization" className="group-active/cell-button:press size-8" id={org.id} name={org.name} url={org.thumbnailUrl} />
            <span className="group-active/cell-button:press link-decoration group-active/cell-button:link-decoration-strong truncate group-hover/cell-button:underline max-sm:sr-only">
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
      renderEditCell: (props) => <RenderEnumSelect {...props} field="status" options={statusOptions} renderOption={(status) => t(`c:${status}`)} />,
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
    dateColumn('createdAt', { name: t('c:created_at') }),
  ];

  return useState<ColumnOrColumnGroup<Tenant>[]>(columns);
};
