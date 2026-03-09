import { MailboxIcon, PlusIcon, XSquareIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { getOrganizations } from '~/api.gen';
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
import { SheetTabs } from '~/modules/common/sheet-tabs';
import { useSheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import type { EnrichedOrganization, OrganizationsRouteSearchParams } from '~/modules/organization/types';
import { CreateNewsletterForm } from '~/modules/system/create-newsletter-form';
import { NewsletterPreview } from '~/modules/system/newsletter-preview';
import { DropdownMenuCheckboxItem } from '~/modules/ui/dropdown-menu';
import { useInfiniteQueryTotal } from '~/query/basic/use-infinite-query-total';

type OrganizationsTableBarProps = BaseTableBarProps<EnrichedOrganization, OrganizationsRouteSearchParams> & {
  isCompact: boolean;
  setIsCompact: (isCompact: boolean) => void;
};

export const OrganizationsTableBar = ({
  selected,
  queryKey,
  searchVars,
  setSearch,
  columns,
  setColumns,
  clearSelection,
  isCompact,
  setIsCompact,
}: OrganizationsTableBarProps) => {
  const { t } = useTranslation();

  const removeDialog = useDialoger((state) => state.remove);
  const createDialog = useDialoger((state) => state.create);

  const total = useInfiniteQueryTotal(queryKey);

  const createButtonRef = useRef(null);
  const newsletterButtonRef = useRef(null);

  const { q, order, sort } = searchVars;

  const isFiltered = !!q;
  // Drop selected rows on search
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
    const newsletterTabs = [
      {
        id: 'write',
        label: 'common:write',
        element: <CreateNewsletterForm organizationIds={ids} callback={clearSelection} />,
      },
      { id: 'preview', label: 'common:preview', element: <NewsletterPreview /> },
    ];

    useSheeter.getState().create(<SheetTabs tabs={newsletterTabs} />, {
      id: 'create-newsletter',
      side: 'right',
      triggerRef: newsletterButtonRef,
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:newsletter'),
      titleContent: <UnsavedBadge title={t('common:newsletter')} />,
      description: t('common:newsletter.text'),
      onClose: clearSelection,
    });
  };

  const fetchExport = async (limit: number) => {
    const response = await getOrganizations({
      query: { limit: String(limit), q, sort: sort || 'createdAt', order: order || 'asc', offset: '0' },
    });
    return response.items;
  };

  return (
    <TableBarContainer searchVars={searchVars} offsetTop={40}>
      {/* Filter bar */}
      <TableFilterBar onResetFilters={onResetFilters} isFiltered={isFiltered}>
        <FilterBarActions>
          {selected.length > 0 ? (
            <>
              <TableBarButton
                ref={newsletterButtonRef}
                onClick={openNewsletterSheet}
                label="common:newsletter"
                icon={MailboxIcon}
                badge={selected.length}
                className="relative"
              />
              <TableBarButton variant="ghost" onClick={clearSelection} icon={XSquareIcon} label="common:clear" />
            </>
          ) : (
            !isFiltered && (
              <TableBarButton
                label="common:create"
                icon={PlusIcon}
                onClick={() => {
                  createDialog(<CreateOrganizationForm callback={onCreateOrganization} />, {
                    id: 'create-organization',
                    triggerRef: createButtonRef,
                    className: 'md:max-w-2xl',
                    title: t('common:create_resource', { resource: t('common:organization').toLowerCase() }),
                    titleContent: (
                      <UnsavedBadge
                        title={t('common:create_resource', { resource: t('common:organization').toLowerCase() })}
                      />
                    ),
                  });
                }}
              />
            )
          )}
          {selected.length === 0 && (
            <TableCount
              count={total}
              label="common:organization"
              isFiltered={isFiltered}
              onResetFilters={onResetFilters}
            />
          )}
        </FilterBarActions>

        <div className="sm:grow" />

        <FilterBarSearch>
          <TableSearch name="organizationSearch" value={q} setQuery={onSearch} />
        </FilterBarSearch>
      </TableFilterBar>

      {/* Columns view */}
      <ColumnsView className="max-lg:hidden" columns={columns} setColumns={setColumns}>
        <DropdownMenuCheckboxItem
          className="min-h-8"
          checked={isCompact}
          onCheckedChange={() => setIsCompact(!isCompact)}
        >
          {t('common:compact_view')}
        </DropdownMenuCheckboxItem>
      </ColumnsView>

      {/* Export */}
      <Export
        className="max-lg:hidden"
        filename={`${appConfig.slug}-organizations`}
        columns={columns}
        selectedRows={selected}
        fetchRows={fetchExport}
      />

      {/* Focus view */}
      <FocusView iconOnly />
    </TableBarContainer>
  );
};
