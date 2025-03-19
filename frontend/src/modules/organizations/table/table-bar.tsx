import { config } from 'config';
import { Mailbox, Plus, Trash, XSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sort } from 'virtua/unstable_core';
import ColumnsView from '~/modules/common/data-table/columns-view';
import Export from '~/modules/common/data-table/export';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import TableCount from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarContent, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import TableSearch from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps, BaseTableMethods } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { SheetTabs } from '~/modules/common/sheet-tabs';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { toaster } from '~/modules/common/toaster';
import UnsavedBadge from '~/modules/common/unsaved-badge';
import { getOrganizations } from '~/modules/organizations/api';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import DeleteOrganizations from '~/modules/organizations/delete-organizations';
import type { OrganizationsSearch } from '~/modules/organizations/table/table-wrapper';
import type { Organization } from '~/modules/organizations/types';
import CreateNewsletterForm from '~/modules/system/create-newsletter-form';
import NewsletterPreview from '~/modules/system/newsletter-preview';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

type OrganizationsTableBarProps = BaseTableMethods & BaseTableBarProps<Organization, OrganizationsSearch>;

export const OrganizationsTableBar = ({
  total,
  selected,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: OrganizationsTableBarProps) => {
  const { t } = useTranslation();
  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const { q, order } = searchVars;

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
    removeDialog('create-organization');
  };

  const openDeleteDialog = () => {
    const callback = () => {
      toaster(t('common:success.delete_resources', { resources: t('common:organizations') }), 'success');
      clearSelection();
    };

    createDialog(<DeleteOrganizations organizations={selected} dialog callback={callback} />, {
      className: 'max-w-xl',
      title: t('common:delete'),
      description: t('common:confirm.delete_resources', { resources: t('common:organizations').toLowerCase() }),
    });
  };

  const openNewsletterSheet = () => {
    const ids = selected.map((o) => o.id);
    const newsletterTabs = [
      { id: 'write', label: 'common:write', element: <CreateNewsletterForm organizationIds={ids} /> },
      { id: 'preview', label: 'common:preview', element: <NewsletterPreview /> },
    ];

    useSheeter.getState().create(<SheetTabs tabs={newsletterTabs} />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:newsletter'),
      titleContent: <UnsavedBadge title={t('common:newsletter')} />,
      description: t('common:newsletter.text'),
      id: 'create-newsletter',
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
                  createDialog(<CreateOrganizationForm callback={onCreateOrganization} />, {
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
