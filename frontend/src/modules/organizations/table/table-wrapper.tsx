import { useRef, useState } from 'react';
import type { z } from 'zod';
import { useMutateQueryData } from '~/query/hooks/use-mutate-query-data';

import { config } from 'config';
import { useTranslation } from 'react-i18next';
import useSearchParams from '~/hooks/use-search-params';
import { useSortColumns } from '~/modules/common/data-table/sort-columns';
import type { BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { SheetTabs } from '~/modules/common/sheet-tabs';
import { sheet } from '~/modules/common/sheeter/state';
import { toaster } from '~/modules/common/toaster';
import { getOrganizations } from '~/modules/organizations/api';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import NewsletterDraft from '~/modules/organizations/newsletter-draft';
import NewsletterForm from '~/modules/organizations/newsletter-form';
import { organizationsKeys } from '~/modules/organizations/query';
import { useColumns } from '~/modules/organizations/table/columns';
import BaseDataTable from '~/modules/organizations/table/table';
import { OrganizationsTableBar } from '~/modules/organizations/table/table-bar';
import type { Organization } from '~/modules/organizations/types';
import { OrganizationsTableRoute, type organizationsSearchSchema } from '~/routes/system';

const LIMIT = config.requestLimits.organizations;

export type OrganizationsSearch = z.infer<typeof organizationsSearchSchema>;

const OrganizationsTable = () => {
  const { t } = useTranslation();

  const { search, setSearch } = useSearchParams<OrganizationsSearch>({ from: OrganizationsTableRoute.id });
  const dataTableRef = useRef<BaseTableMethods | null>(null);

  // Table state
  const { q, sort, order } = search;
  const limit = LIMIT;

  const mutateQuery = useMutateQueryData(organizationsKeys.list());

  // State for selected and total counts
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Organization[]>([]);

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
          toaster(t('common:success.delete_resources', { resources: t('common:organizations') }), 'success');
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
    const ids = selected.map((o) => o.id);
    const newsletterTabs = [
      { id: 'write', label: 'common:write', element: <NewsletterForm organizationIds={ids} /> },
      { id: 'preview', label: 'common:preview', element: <NewsletterDraft /> },
    ];

    sheet.create(<SheetTabs tabs={newsletterTabs} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:newsletter'),
      description: t('common:newsletter.text'),
      id: 'newsletter-sheet',
      scrollableOverlay: true,
      side: 'right',
      removeCallback: clearSelection,
    });
  };

  const fetchExport = async (limit: number) => {
    const { items } = await getOrganizations({ limit, q, sort, order });
    return items;
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <OrganizationsTableBar
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
      <BaseDataTable
        ref={dataTableRef}
        columns={columns}
        queryVars={{ q, sort, order, limit }}
        sortColumns={sortColumns}
        setSortColumns={setSortColumns}
        setTotal={setTotal}
        setSelected={setSelected}
      />
    </div>
  );
};

export default OrganizationsTable;
