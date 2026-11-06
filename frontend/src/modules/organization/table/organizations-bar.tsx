import { MailboxIcon, PlusIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TableBarButton } from '~/modules/common/data-table/table-bar-button';
import { TableBarShell, useTableBarFilters } from '~/modules/common/data-table/table-bar-shell';
import type { BaseTableBarProps } from '~/modules/common/data-table/types';
import { type SheetTab, SheetTabs } from '~/modules/common/sheet-tabs';
import { sheeter } from '~/modules/common/sheeter/use-sheeter';
import { UnsavedBadge } from '~/modules/common/unsaved-badge';
import { openCreateOrganizationDialog } from '~/modules/organization/create-organization-form';
import { fetchOrganizationsForExport } from '~/modules/organization/query';
import type { OrganizationRow, OrganizationsRouteSearchParams } from '~/modules/organization/types';
import { CreateNewsletterForm, newsletterFormId } from '~/modules/system/create-newsletter-form';
import { NewsletterPreview } from '~/modules/system/newsletter-preview';
import type { PageRequest } from '~/query/basic/fetch-all-pages';
import { useListQueryTotal } from '~/query/basic/use-list-query-total';

type OrganizationsTableBarProps = BaseTableBarProps<OrganizationRow, OrganizationsRouteSearchParams>;

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

  const total = useListQueryTotal(queryKey);

  const newsletterButtonRef = useRef<HTMLButtonElement>(null);

  const { q, order, sort } = searchVars;
  const barFilters = useTableBarFilters({ searchVars, setSearch, clearSelection, reset: { q: '' } });

  const openNewsletterSheet = () => {
    const ids = selected.map(({ id }) => id);
    const newsletterTabs: SheetTab[] = [
      {
        id: 'write',
        label: 'c:write',
        element: <CreateNewsletterForm organizationIds={ids} />,
      },
      { id: 'preview', label: 'c:preview', element: <NewsletterPreview /> },
    ];

    sheeter.getState().create(<SheetTabs tabs={newsletterTabs} />, {
      id: newsletterFormId,
      side: 'right',
      triggerRef: newsletterButtonRef,
      title: t('c:newsletter'),
      titleContent: <UnsavedBadge title={t('c:newsletter')} />,
      description: t('c:newsletter.text'),
      onClose: clearSelection,
    });
  };

  const fetchExport = (page: PageRequest) => fetchOrganizationsForExport({ q, sort, order }, page);

  return (
    <TableBarShell
      {...barFilters}
      {...{ searchVars, total, columns, setColumns }}
      label="c:organization"
      searchName="organizationSearch"
      action={{ icon: PlusIcon, label: t('c:create'), onClick: openCreateOrganizationDialog }}
      export={{ filename: `${appConfig.slug}-organizations`, selectedRows: selected, fetchRows: fetchExport }}
      selection={{
        count: selected.length,
        onClear: clearSelection,
        children: <TableBarButton ref={newsletterButtonRef} onClick={openNewsletterSheet} label="c:newsletter" icon={MailboxIcon} />,
      }}
    />
  );
}
