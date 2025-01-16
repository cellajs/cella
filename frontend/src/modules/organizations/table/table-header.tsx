import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableHeaderContainer } from '~/modules/common/data-table/table-header';
import TableSearch from '~/modules/common/data-table/table-search';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import type { OrganizationsSearch } from '~/modules/organizations/table';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';
import type { BaseTableHeaderProps, BaseTableMethods, Organization } from '~/types/common';

type OrganizationsTableHeaderProps = BaseTableMethods &
  BaseTableHeaderProps<Organization, OrganizationsSearch> & {
    openRemoveDialog: () => void;
    openNewsletterSheet: () => void;
    fetchExport: (limit: number) => Promise<Organization[]>;
  };

export const OrganizationsTableHeader = ({
  total,
  selected,
  q,
  setSearch,
  columns,
  setColumns,
  openRemoveDialog,
  openNewsletterSheet,
  clearSelection,
  fetchExport,
}: OrganizationsTableHeaderProps) => {
  const { t } = useTranslation();

  const isFiltered = !!q;
  // Drop selected Rows on search
  const onSearch = (searchString: string) => {
    clearSelection();
    setSearch({ q: searchString });
  };

  const onResetFilters = () => {
    setSearch({ q: '' });
    clearSelection();
  };

  return (
    <TableHeaderContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <Button onClick={openNewsletterSheet} className="relative">
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selected.length}</Badge>
                <Mailbox size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
              </Button>
              <Button variant="destructive" className="relative" onClick={openRemoveDialog}>
                <Badge className="py-0 px-1 absolute -right-2 min-w-5 flex justify-center -top-1.5">{selected.length}</Badge>
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
          {selected.length === 0 && <TableCount count={total} type="organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarContent>
          <TableSearch value={q} setQuery={onSearch} />
        </FilterBarContent>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      {/* Export */}
      <Export className="max-lg:hidden" filename={`${config.slug}-organizations`} columns={columns} selectedRows={selected} fetchRows={fetchExport} />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableHeaderContainer>
  );
};
