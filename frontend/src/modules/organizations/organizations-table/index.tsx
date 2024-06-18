import { infiniteQueryOptions, useInfiniteQuery } from '@tanstack/react-query';
import { useSearch } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { type GetOrganizationsParams, getOrganizations } from '~/api/organizations';

import type { getOrganizationsQuerySchema } from 'backend/modules/organizations/schema';
import { Bird } from 'lucide-react';
import type { RowsChangeData, SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { z } from 'zod';
import { inviteMembers } from '~/api/memberships';
import { useDebounce } from '~/hooks/use-debounce';
import { useMutateInfiniteQueryData } from '~/hooks/use-mutate-query-data';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { getInitialSortColumns } from '~/modules/common/data-table/init-sort-columns';
import { OrganizationsTableRoute } from '~/routes/system';
import { useUserStore } from '~/store/user';
import type { Organization } from '~/types';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import useQueryResultEffect from '~/hooks/use-query-result-effect';
import { DataTable } from '~/modules/common/data-table';
import { useColumns } from './columns';
import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import { sheet } from '~/modules/common/sheeter/state';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import NewsletterForm from '~/modules/system/newsletter-form';

type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;

export const organizationsQueryOptions = ({ q, sort: initialSort, order: initialOrder, limit }: GetOrganizationsParams) => {
  const sort = initialSort || 'createdAt';
  const order = initialOrder || 'desc';

  return infiniteQueryOptions({
    queryKey: ['organizations', q, sort, order],
    initialPageParam: 0,
    refetchOnWindowFocus: false,
    queryFn: async ({ pageParam: page, signal }) => await getOrganizations({ page, q, sort, order, limit }, signal),
    getNextPageParam: (_lastPage, allPages) => allPages.length,
  });
};

const LIMIT = 40;

const OrganizationsTable = () => {
  const search = useSearch({ from: OrganizationsTableRoute.id });
  const { t } = useTranslation();

  const user = useUserStore((state) => state.user);

  const [rows, setRows] = useState<Organization[]>([]);
  const [selectedRows, setSelectedRows] = useState(new Set<string>());
  const [query, setQuery] = useState<OrganizationsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // Search query options
  const q = useDebounce(query, 200);
  const sort = sortColumns[0]?.columnKey as OrganizationsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'];
  const limit = LIMIT;

  const selectedOrganizations = useMemo(() => {
    return rows.filter((row) => selectedRows.has(row.id));
  }, [rows, selectedRows]);

  const openDeleteDialog = () => {
    dialog(
      <DeleteOrganizations
        organizations={selectedOrganizations}
        callback={(organizations) => {
          callback(organizations, 'delete');
          toast.success(t('common:success.delete_resources', { resources: t('common:organizations') }));
        }}
        dialog
      />,
      {
        drawerOnMobile: false,
        className: 'max-w-xl',
        title: t('common:delete'),
        text: t('common:confirm.delete_resources', { resources: t('common:organizations').toLowerCase() }),
      },
    );
  };

  const openNewsletterSheet = () => {
    sheet(<NewsletterForm sheet />, {
      className: 'xl:w-[50vw]',
      title: t('common:newsletter'),
      text: t('common:newsletter.text'),
      id: 'newsletter-form',
    });
  };

  // Save filters in search params
  const filters = useMemo(
    () => ({
      q,
      sort,
      order,
    }),
    [q, sort, order],
  );
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Query organizations
  const queryResult = useInfiniteQuery(organizationsQueryOptions({ q, sort, order, limit }));

  // Total count
  const totalCount = queryResult.data?.pages[0].total;

  const callback = useMutateInfiniteQueryData(['organizations', q, sortColumns]);
  const [columns, setColumns] = useColumns(callback);

  const onRowsChange = async (changedRows: Organization[], { column, indexes }: RowsChangeData<Organization>) => {
    // mutate member
    for (const index of indexes) {
      const organization = changedRows[index];
      if (column.key === 'userRole' && organization.membership?.role) {
        inviteMembers({
          idOrSlug: organization.id,
          emails: [user.email],
          role: organization.membership?.role,
          entityType: 'ORGANIZATION',
          organizationId: organization.id,
        })
          .then(() => {
            toast.success(t('common:success.your_role_updated'));
          })
          .catch(() => {
            toast.error(t('common:error.error'));
          });
      }
    }

    setRows(changedRows);
  };

  const isFiltered = !!q;

  const onResetFilters = () => {
    setQuery('');
    setSelectedRows(new Set<string>());
  };

  useQueryResultEffect<Organization>({ queryResult, setSelectedRows, setRows, selectedRows });

  return (
    <div className="space-y-4 h-full">
      <div className={'flex items-center max-sm:justify-between md:gap-2'}>
        <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
          <FilterBarActions>
            {selectedOrganizations.length > 0 ? (
              <>
                <Button onClick={openNewsletterSheet} className="relative">
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedOrganizations.length}</Badge>
                  <Mailbox size={16} />
                  <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
                </Button>
                <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                  <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-2">{selectedOrganizations.length}</Badge>
                  <Trash size={16} />
                  <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
                </Button>
                <Button variant="ghost" onClick={() => setSelectedRows(new Set<string>())}>
                  <XSquare size={16} />
                  <span className="ml-1">{t('common:clear')}</span>
                </Button>
              </>
            ) : (
              !isFiltered &&
              user.role === 'ADMIN' && (
                <Button
                  onClick={() => {
                    dialog(<CreateOrganizationForm callback={(organization) => callback([organization], 'create')} dialog />, {
                      className: 'md:max-w-2xl',
                      id: 'create-organization',
                      title: t('common:create_resource', { resource: t('common:organization').toLowerCase() }),
                    });
                  }}
                >
                  <Plus size={16} />
                  <span className="ml-1">{t('common:create')}</span>
                </Button>
              )
            )}
            {selectedOrganizations.length === 0 && (
              <TableCount count={totalCount} type="organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />
            )}
          </FilterBarActions>

          <div className="sm:grow" />

          <FilterBarContent>
            <TableSearch value={query} setQuery={setQuery} />
          </FilterBarContent>
        </TableFilterBar>
        <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />
        <Export
          className="max-lg:hidden"
          filename={`${config.slug}-organizations`}
          columns={columns}
          selectedRows={selectedOrganizations}
          fetchRows={async (limit) => {
            const { items } = await getOrganizations({ limit, q: query, sort, order });
            return items;
          }}
        />
        <FocusView iconOnly />
      </div>
      <DataTable<Organization>
        {...{
          columns: columns.filter((column) => column.visible),
          rows,
          totalCount,
          rowHeight: 42,
          rowKeyGetter: (row) => row.id,
          error: queryResult.error,
          isLoading: queryResult.isLoading,
          isFetching: queryResult.isFetching,
          enableVirtualization: false,
          isFiltered,
          limit,
          selectedRows,
          onRowsChange,
          fetchMore: queryResult.fetchNextPage,
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
};

export default OrganizationsTable;
