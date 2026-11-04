import { SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';

interface NoRowsProps {
  isFiltered?: boolean;
  /** Clears the search, offered under a search's empty state. */
  onResetFilters?: () => void;
  isFetching?: boolean;
  /** Replaces the default empty text while nothing is filtered; it pads itself, as a ContentPlaceholder does. */
  emptyContent?: ReactNode;
}

export function NoRows({ isFiltered, onResetFilters, isFetching, emptyContent }: NoRowsProps) {
  const { t } = useTranslation();
  if (isFetching) return null;

  const resource = t('c:results');
  if (isFiltered) {
    return (
      <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleOptions={{ resource }}>
        {onResetFilters && (
          <Button variant="secondary" onClick={onResetFilters}>
            {t('c:clear_all')}
          </Button>
        )}
      </ContentPlaceholder>
    );
  }
  return emptyContent ?? <p className="p-8 text-center">{t('c:no_resource_yet', { resource })}</p>;
}
