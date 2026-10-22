import { SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';

interface NoRowsProps {
  isFiltered?: boolean;
  isFetching?: boolean;
  /** Replaces the default empty text while nothing is filtered. */
  emptyContent?: ReactNode;
}
export function NoRows({ isFiltered, isFetching, emptyContent }: NoRowsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col items-center justify-center p-8">
      {isFiltered && !isFetching && (
        <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleProps={{ resource: t('c:results').toLowerCase() }} />
      )}
      {!isFiltered && !isFetching && (emptyContent ?? t('c:no_resource_yet', { resource: t('c:results').toLowerCase() }))}
    </div>
  );
}
