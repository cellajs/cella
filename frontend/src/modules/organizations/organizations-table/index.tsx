import { Suspense, lazy, useMemo, useRef, useState } from 'react';
import type { z } from 'zod';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';
import type { getOrganizationsQuerySchema } from '#/modules/organizations/schema';

import { useSearch } from '@tanstack/react-router';
import { config } from 'config';
import type { SortColumn } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { getOrganizations } from '~/api/organizations';
import useSaveInSearchParams from '~/hooks/use-save-in-search-params';
import { showToast } from '~/lib/toasts';
import { getInitialSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import { useColumns } from '~/modules/organizations/organizations-table/columns';
import { OrganizationsTableHeader } from '~/modules/organizations/organizations-table/table-header';
import NewsletterDraft from '~/modules/system/newsletter-draft';
import OrganizationsNewsletterForm from '~/modules/system/organizations-newsletter-form';
import { OrganizationsTableRoute } from '~/routes/system';
import type { BaseTableMethods, Organization } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';

const BaseOrganizationsTable = lazy(() => import('~/modules/organizations/organizations-table/table'));
const LIMIT = config.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof getOrganizationsQuerySchema>;

const OrganizationsTable = () => {
  const { t } = useTranslation();
  const search = useSearch({ from: OrganizationsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const mutateQuery = useMutateQueryData(['organizations', 'list']);
  // Table state
  const [q, setQuery] = useState<OrganizationsSearch['q']>(search.q);
  const [sortColumns, setSortColumns] = useState<SortColumn[]>(getInitialSortColumns(search));

  // State for selected and total counts
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Organization[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Organization[], newTotal: number) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Search query options
  const sort = sortColumns[0]?.columnKey as OrganizationsSearch['sort'];
  const order = sortColumns[0]?.direction.toLowerCase() as OrganizationsSearch['order'];
  const limit = LIMIT;

  // Save filters in search params
  const filters = useMemo(() => ({ q, sort, order }), [q, sortColumns]);
  useSaveInSearchParams(filters, { sort: 'createdAt', order: 'desc' });

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);

  const clearSelection = () => {
    if (dataTableRef.current) dataTableRef.current.clearSelection();
  };

  const openRemoveDialog = () => {
    dialog(
      <DeleteOrganizations
        organizations={selected}
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
        element: <OrganizationsNewsletterForm sheet organizationIds={selected.map((o) => o.id)} dropSelectedOrganization={clearSelection} />,
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

  const fetchExport = async (limit: number) => {
    const { items } = await getOrganizations({ limit, q, sort: search.sort, order: search.order });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableHeader
        total={total}
        selected={selected}
        columns={columns}
        q={q ?? ''}
        setQuery={setQuery}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openNewsletterSheet={openNewsletterSheet}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseOrganizationsTable
          ref={dataTableRef}
          columns={columns}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
          queryVars={{
            q,
            sort,
            order,
            limit,
          }}
          updateCounts={updateCounts}
        />
      </Suspense>
    </div>
  );
};

export default OrganizationsTable;
