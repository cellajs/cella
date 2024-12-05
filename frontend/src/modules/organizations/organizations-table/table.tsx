import { onlineManager } from '@tanstack/react-query';
import { forwardRef, useImperativeHandle, useMemo, useState } from 'react';
import { getOrganizations } from '~/api/organizations';

import { config } from 'config';
import { Bird } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { inviteMembers } from '~/api/memberships';
import { useDataFromSuspenseInfiniteQuery } from '~/hooks/use-data-from-query';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { DataTable } from '~/modules/common/data-table';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';

import { useSearch } from '@tanstack/react-router';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import { showToast } from '~/lib/toasts';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import type { OrganizationsSearch, OrganizationsTableMethods } from '~/modules/organizations/organizations-table';
import { useColumns } from '~/modules/organizations/organizations-table/columns';
import { organizationsQueryOptions } from '~/modules/organizations/organizations-table/helpers/query-options';
import NewsletterDraft from '~/modules/system/newsletter-draft';
import OrganizationsNewsletterForm from '~/modules/system/organizations-newsletter-form';
import { OrganizationsTableRoute } from '~/routes/system';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types/common';

const LIMIT = config.requestLimits.organizations;
type BaseOrganizationsTableProps = { tableId: string; tableFilterBar: React.ReactNode };

export const BaseOrganizationsTable = forwardRef<OrganizationsTableMethods, BaseOrganizationsTableProps>(
  ({ tableId, tableFilterBar }: BaseOrganizationsTableProps, ref) => {
    const search = useSearch({ from: OrganizationsTableRoute.id });
    const { t } = useTranslation();

    const { user } = useUserStore();

    // Table state
    const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

    // Search query options
    const sort = sortColumns[0]?.columnKey as OrganizationsSearch['sort'];
    const order = sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'];
    const limit = LIMIT;

    const isFiltered = !!search.q;

    // Query organizations
    const { rows, selectedRows, setRows, setSelectedRows, totalCount, isLoading, isFetching, error, fetchNextPage } =
      useDataFromSuspenseInfiniteQuery(organizationsQueryOptions({ q: search.q, sort, order, limit }));

    const mutateQuery = useMutateQueryData(['organizations', 'list']);

    // Build columns
    const [columns, setColumns] = useColumns(mutateQuery.update);

    // Save filters in search params
    const filters = useMemo(() => ({ sort, order }), [sort, order]);
    useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

    // Table selection
    const selectedOrganizations = useMemo(() => {
      return rows.filter((row) => selectedRows.has(row.id));
    }, [rows, selectedRows]);

    const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
      if (!onlineManager.isOnline()) return showToast(t('common:action.offline.text'), 'warning');

      if (column.key !== 'userRole') return setRows(changedRows);

      // If user role is changed, invite user to organization
      for (const index of indexes) {
        const organization = changedRows[index];
        if (!organization.membership?.role) continue;

        inviteMembers({
          idOrSlug: organization.id,
          emails: [user.email],
          role: organization.membership?.role,
          entityType: 'organization',
          organizationId: organization.id,
        })
          .then(() => toast.success(t('common:success.role_updated')))
          .catch(() => toast.error(t('common:error.error')));
      }

      setRows(changedRows);
    };

    const openRemoveDialog = () => {
      dialog(
        <DeleteOrganizations
          organizations={selectedOrganizations}
          callback={(organizations) => {
            showToast(t('common:success.delete_resources', { resources: t('common:organizations') }), 'success');
            mutateQuery.remove(organizations);
          }}
          dialog
        />,
        {
          drawerOnMobile: false,
          className: 'max-w-xl',
          title: t('common:delete'),
          description: t('common:confirm.delete_resources', { resources: t('common:organizations').toLowerCase() }),
        },
      );
    };

    const openNewsletterSheet = () => {
      const newsletterTabs = [
        {
          id: 'write',
          label: 'common:write',
          element: (
            <OrganizationsNewsletterForm
              sheet
              organizationIds={selectedOrganizations.map((o) => o.id)}
              dropSelectedOrganization={() => setSelectedRows(new Set<string>())}
            />
          ),
        },

        {
          id: 'draft',
          label: 'common:draft',
          element: <NewsletterDraft />,
        },
      ];
      sheet.create(<SheetNav tabs={newsletterTabs} />, {
        className: 'max-w-full lg:max-w-4xl',
        title: t('common:newsletter'),
        description: t('common:newsletter.text'),
        id: 'newsletter-form',
        scrollableOverlay: true,
        side: 'right',
      });
    };

    // Expose methods via ref using useImperativeHandle
    useImperativeHandle(ref, () => ({
      clearSelection: () => setSelectedRows(new Set<string>()),
      openRemoveDialog,
      openNewsletterSheet,
    }));
    console.log(24);
    return (
      <div id={tableId} data-total-count={totalCount} data-selected={selectedOrganizations.length} className="flex flex-col gap-4 h-full">
        <div className={'flex items-center max-sm:justify-between md:gap-2'}>
          {/* Filter bar */}
          {tableFilterBar}

          {/* Columns view */}
          <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

          {/* Export */}
          <Export
            className="max-lg:hidden"
            filename={`${config.slug}-organizations`}
            columns={columns}
            selectedRows={selectedOrganizations}
            fetchRows={async (limit) => {
              const { items } = await getOrganizations({ limit, q: search.q, sort, order });
              return items;
            }}
          />
          {/* Focus view */}
          <FocusView iconOnly />
        </div>

        {/* Table */}
        <DataTable<Organization>
          {...{
            columns: columns.filter((column) => column.visible),
            rows,
            totalCount,
            rowHeight: 42,
            rowKeyGetter: (row) => row.id,
            error,
            isLoading,
            isFetching,
            enableVirtualization: false,
            isFiltered,
            limit,
            selectedRows,
            onRowsChange,
            fetchMore: fetchNextPage,
            onSelectedRowsChange: setSelectedRows,
            sortColumns,
            onSortColumnsChange: setSortColumns,
            NoRowsComponent: (
              <ContentPlaceholder Icon={Bird} title={t('common:no_resource_yet', { resource: t('common:organizations').toLowerCase() })} />
            ),
          }}
        />
      </div>
    );
  },
);
