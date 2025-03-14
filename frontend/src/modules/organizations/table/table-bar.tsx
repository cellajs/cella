import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { dialog } from '~/modules/common/dialoger/state';
import { FocusView } from '~/modules/common/focus-view';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import type { OrganizationsSearch } from '~/modules/organizations/table/table-wrapper';
import type { Organization } from '~/modules/organizations/types';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

type OrganizationsTableBarProps = BaseTableMethods &
  BaseTableBarProps<Organization, OrganizationsSearch> & {
    openDeleteDialog: () => void;
    openNewsletterSheet: () => void;
    fetchExport: (limit: number) => Promise<Organization[]>;
  };

export const OrganizationsTableBar = ({
  total,
  selected,
  q,
  setSearch,
  columns,
  setColumns,
  openDeleteDialog,
  openNewsletterSheet,
  clearSelection,
  fetchExport,
}: OrganizationsTableBarProps) => {
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

  const onCreateOrganization = () => {
    dialog.remove(true, 'create-organization');
  };

  return (
    <TableBarContainer>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <Button onClick={openNewsletterSheet} className="relative">
                <Badge context="button">{selected.length}</Badge>
                <Mailbox size={16} />
                <span className="ml-1 max-xs:hidden">{t('common:newsletter')}</span>
              </Button>
              <Button variant="destructive" className="relative" onClick={openDeleteDialog}>
                <Badge context="button">{selected.length}</Badge>
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
                  dialog(<CreateOrganizationForm callback={onCreateOrganization} />, {
                    className: 'md:max-w-2xl',
                    id: 'create-organization',
                    title: t('common:create_resource', { resource: t('common:organization').toLowerCase() }),
                    titleContent: <UnsavedBadge title={t('common:create_resource', { resource: t('common:organization').toLowerCase() })} />,
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
    </TableBarContainer>
  );
};
