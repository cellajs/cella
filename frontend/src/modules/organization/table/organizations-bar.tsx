import { MailboxIcon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { ColumnsView } from '~/modules/common/data-table/columns-view';
import { Export } from '~/modules/common/data-table/export';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarContainer } from '~/modules/common/data-table/table-bar-container';
import { TableCount } from '~/modules/common/data-table/table-count';
import { FilterBarActions, FilterBarSearch, TableFilterBar } from '~/modules/common/data-table/table-filter-bar';
import { TableSearch } from '~/modules/common/data-table/table-search';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { FocusView } from '~/modules/common/focus-view';
import { SelectionActionBar } from '~/modules/common/selection-action-bar';
import { type SheetTab, SheetTabs } from '~/modules/common/sheet-tabs';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { fetchOrganizationsForExport } from '~/modules/organization/query';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';
import { CreateNewsletterForm } from '~/modules/system/create-newsletter-form';
import { NewsletterPreview } from '~/modules/system/newsletter-preview';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type OrganizationsTableBarProps = BaseTableBarProps<EnrichedOrganization, OrganizationsRouteSearchParams>;

export function OrganizationsTableBar({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
}: OrganizationsTableBarProps) {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const total = useListQueryTotal(queryKey);

  const createButtonRef = useRef(null);
  const newsletterButtonRef = useRef(null);

  const { q, order, sort } = searchVars;

  const isFiltered = !!q;
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

  const openNewsletterSheet = () => {
    const ids = selected.map((o) => o.id);
    const newsletterTabs: SheetTab[] = [
      {
        id: 'write',
        label: 'c:write',
        element: <CreateNewsletterForm organizationIds={ids} callback={clearSelection} />,
      },
      { id: 'preview', label: 'c:preview', element: <NewsletterPreview /> },
    ];

    useSheeter.getState().create(<SheetTabs tabs={newsletterTabs} />, {
      id: 'create-newsletter',
      side: 'right',
      triggerRef: newsletterButtonRef,
      className: 'max-w-full lg:max-w-4xl',
      title: t('c:newsletter'),
      titleContent: <UnsavedBadge title={t('c:newsletter')} />,
      description: t('c:newsletter.text'),
      onClose: clearSelection,
    });
  };

  const fetchExport = async (limit: number, offset: number) => {
    return fetchOrganizationsForExport({ limit, offset, q, sort, order });
  };

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={48}>
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {!isFiltered && (
            <TableBarButton
              label="c:create"
              icon={PlusIcon}
              onClick={() => {
                createDialog(<CreateOrganizationForm callback={onCreateOrganization} />, {
                  id: 'create-organization',
                  triggerRef: createButtonRef,
                  className: 'md:max-w-2xl',
                  title: t('c:create_resource', { resource: t('c:organization').toLowerCase() }),
                  titleContent: (
                    <UnsavedBadge title={t('c:create_resource', { resource: t('c:organization').toLowerCase() })} />
                  ),
                });
              }}
            />
          )}
          <TableCount count={total} label="c:organization" isFiltered={isFiltered} onResetFilters={onResetFilters} />
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="organizationSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns} />

      <Export
        className="max-lg:hidden"
        filename={`${appConfig.slug}-organizations`}
        columns={columns}
        selectedRows={selected}
        fetchRows={fetchExport}
      />

      <FocusView iconOnly />

      <SelectionActionBar count={selected.length} onClear={clearSelection}>
        <TableBarButton
          ref={newsletterButtonRef}
          onClick={openNewsletterSheet}
          label="c:newsletter"
          icon={MailboxIcon}
        />
      </SelectionActionBar>
    </TableBarContainer>
  );
}
