import { Link } from '@tanstack/react-router';
import { Link2OffIcon } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useTranslation } from 'react-i18next';
import type { Tenant } from 'sdk';
import { isStrategyEnabled } from 'shared';
import { enumSelectEditorOptions, RenderEnumSelect } from '~/modules/common/data-grid/cell-renderers';
import { cellLinkTextClass, dateColumn } from '~/modules/common/data-table/columns';
import type { ColumnOrColumnGroup } from '~/modules/common/data-table/types';
import { useColumnVisibility } from '~/modules/common/data-table/use-column-visibility';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { NamedText } from '~/modules/common/named-text';
import { openEditSheet } from '~/modules/common/sheeter/open-edit-sheet';
import type { TriggerRef } from '~/modules/common/sheeter/use-sheeter';
import { ConnectionsCard } from '~/modules/tenants/connections/connections-card';
import { statusOptions, UpdateTenantForm } from '~/modules/tenants/update-tenant-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

type BadgeVariant = ComponentProps<typeof Badge>['variant'];

const statusTextClasses: Record<Tenant['status'], string> = {
  active: 'text-success',
  suspended: 'text-warning',
  archived: 'text-muted-foreground',
};

const subscriptionVariants: Record<Exclude<Tenant['subscriptionStatus'], 'none'>, BadgeVariant> = {
  trialing: 'default',
  active: 'success',
  past_due: 'destructive',
  paused: 'secondary',
  canceled: 'secondary',
};

export const openUpdateTenantSheet = (tenant: Tenant, triggerRef: TriggerRef) =>
  openEditSheet({
    id: 'update-tenant',
    resource: 'c:tenant',
    description: tenant.organization ? (
      <NamedText i18nKey="c:update_tenant.text" name={tenant.organization.name} values={{ id: tenant.id }} />
    ) : (
      <NamedText i18nKey="c:update_tenant_no_organization.text" values={{ id: tenant.id }} />
    ),
    triggerRef,
    section: { label: 'c:general', id: 'update-tenant-general' },
    children: <UpdateTenantForm tenant={tenant} sheet />,
    after: isStrategyEnabled('sso') ? <ConnectionsCard tenant={tenant} className="mb-20" /> : undefined,
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
      renderCell: ({ row }) => <code className="text-xs">{row.id}</code>,
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
        <Button variant="cell" size="cell" tabIndex={tabIndex} onClick={(event) => openUpdateTenantSheet(row, { current: event.currentTarget })}>
          <span className={cn(cellLinkTextClass, 'font-medium')}>
            <HighlightText text={row.name || '-'} />
          </span>
        </Button>
      ),
    },
    {
      // One organization per tenant; on mobile the column narrows to the avatar, and header and names stay readable to a screen reader.
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
            <Badge soft>
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
                tabIndex={tabIndex}
                params={{ tenantId: row.id, organizationSlug: org.slug }}
              />
            }
          >
            <EntityAvatar type="organization" className="size-8" id={org.id} name={org.name} url={org.thumbnailUrl} />
            <span className={cn(cellLinkTextClass, 'max-sm:sr-only')}>{org.name || '-'}</span>
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
      renderCell: ({ row }) => <span className={cn('font-medium', statusTextClasses[row.status])}>{t(`c:${row.status}`)}</span>,
      renderEditCell: (props) => <RenderEnumSelect {...props} field="status" options={statusOptions} renderOption={(status) => t(`c:${status}`)} />,
    },
    {
      key: 'subscriptionStatus',
      name: t('c:subscription'),
      minBreakpoint: 'md',
      width: 140,
      placeholderValue: '-',
      renderCell: ({ row }) =>
        row.subscriptionStatus === 'none' ? null : (
          <Badge variant={subscriptionVariants[row.subscriptionStatus]} soft>
            {t(`c:${row.subscriptionStatus}`)}
          </Badge>
        ),
    },
    dateColumn('createdAt', { name: t('c:created_at') }),
  ];

  return useColumnVisibility(columns);
};
