import { Suspense, lazy, useRef, useState } from 'react';
import type { z } from 'zod';
import { useMutateQueryData } from '~/hooks/use-mutate-query-data';

import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { getOrganizations } from '~/api/organizations';
import useSearchParams from '~/hooks/use-search-params';
import { showToast } from '~/lib/toasts';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import { dialog } from '~/modules/common/dialoger/state';
import { SheetNav } from '~/modules/common/sheet-nav';
import { sheet } from '~/modules/common/sheeter/state';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import { useColumns } from '~/modules/organizations/organizations-table/columns';
import { OrganizationsTableHeader } from '~/modules/organizations/organizations-table/table-header';
import NewsletterDraft from '~/modules/system/newsletter-draft';
import OrganizationsNewsletterForm from '~/modules/system/organizations-newsletter-form';
import { OrganizationsTableRoute, type organizationsSearchSchema } from '~/routes/system';
import type { BaseTableMethods, Organization } from '~/types/common';
import { arraysHaveSameElements } from '~/utils';
import { organizationsKeys } from '~/utils/quey-key-factories';

const BaseDataTable = lazy(() => import('~/modules/organizations/organizations-table/table'));
const LIMIT = config.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;

const OrganizationsTable = () => {
  const { t } = useTranslation();
  const { search, setSearch } = useSearchParams<OrganizationsSearch>({ from: OrganizationsTableRoute.id });

  const dataTableRef = useRef<BaseTableMethods | null>(null);

  const mutateQuery = useMutateQueryData(organizationsKeys.list());
  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Organization[]>([]);

  // Update total and selected counts
  const updateCounts = (newSelected: Organization[], newTotal: number | undefined) => {
    if (newTotal !== total) setTotal(newTotal);
    if (!arraysHaveSameElements(selected, newSelected)) setSelected(newSelected);
  };

  // Build columns
  const [columns, setColumns] = useColumns(mutateQuery.update);
  const { sortColumns, setSortColumns } = useSortColumns(sort, order, setSearch);

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
    const { items } = await getOrganizations({ limit, q, sort, order });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableHeader
        total={total}
        selected={selected}
        columns={columns}
        q={q ?? ''}
        setSearch={setSearch}
        setColumns={setColumns}
        clearSelection={clearSelection}
        openRemoveDialog={openRemoveDialog}
        openNewsletterSheet={openNewsletterSheet}
        fetchExport={fetchExport}
      />
      <Suspense>
        <BaseDataTable
          ref={dataTableRef}
          columns={columns}
          queryVars={{ q, sort, order, limit }}
          updateCounts={updateCounts}
          sortColumns={sortColumns}
          setSortColumns={setSortColumns}
        />
      </Suspense>
    </div>
  );
};

export default OrganizationsTable;
