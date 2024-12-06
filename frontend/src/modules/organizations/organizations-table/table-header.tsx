import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import ColumnsView, { type ColumnOrColumnGroup } from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { Organization } from '~/types/common';
import type { OrganizationsTableMethods } from '.';

type OrganizationsTableHeaderProps = {
  tableId: string;
  q: string;
  setQuery: (q: string) => void;
  columns: ColumnOrColumnGroup<Organization>[];
  setColumns: Dispatch<SetStateAction<ColumnOrColumnGroup<Organization>[]>>;
  fetchExport: (limit: number) => Promise<Organization[]>;
} & OrganizationsTableMethods;

export const OrganizationsTableHeader = ({
  tableId,
  q,
  setQuery,
  columns,
  setColumns,
  openRemoveDialog,
  openNewsletterSheet,
  clearSelection,
  fetchExport,
}: OrganizationsTableHeaderProps) => {
  const { t } = useTranslation();

  const [selected, setSelected] = useState(0);
  const [total, setTotal] = useState(0);

  const isFiltered = !!q;

  const onResetFilters = () => {
    setQuery('');
    clearSelection();
  };

  useEffect(() => {
    const table = document.getElementById(tableId);
    if (!table) return;

    // Create a MutationObserver to watch for attribute changes
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type !== 'attributes' || (mutation.attributeName !== 'data-selected' && mutation.attributeName !== 'data-total-count')) return;

        if (mutation.attributeName === 'data-selected') {
          const selectedValue = table.getAttribute('data-selected');
          setSelected(Number(selectedValue) || 0);
        }
        if (mutation.attributeName === 'data-total-count') {
          const totalValue = table.getAttribute('data-total-count');
          setTotal(Number(totalValue) || 0);
        }
      }
    });

    // Configure the observer to watch for attribute changes
    observer.observe(table, {
      attributes: true,
    });
    return () => observer.disconnect();
  }, [tableId]);
  return (
    <div className={'flex items-center max-sm:justify-between md:gap-2'}>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected > 0 ? (
            <>
              <Button onClick={openNewsletterSheet} className="relative">
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selected}</Badge>
                <Mailbox size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
              </Button>
              <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selected}</Badge>
                <Trash size={16} />
                <span className="ml-1 max-lg:hidden">{t('common:remove')}</span>
              </Button>
              <Button variant="ghost" onClick={clearSelection}>
                <XSquare size={16} />
                <span className="ml-1">{t('common:clear')}</span>
              </Button>
            </>
          ) : (
            !isFiltered && (
              <Button
                onClick={() => {
                  dialog(<CreateOrganizationForm dialog />, {
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
          {selected === 0 && <TableCount count={total} type="organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch value={q} setQuery={setQuery} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export
        className="max-lg:hidden"
        filename={`${config.slug}-organizations`}
        columns={columns}
        // TODO get way to export selected rows
        // selectedRows={selected}
        fetchRows={fetchExport}
      />
      {/* Focus view */}
      <FocusView iconOnly />
    </div>
  );
};
