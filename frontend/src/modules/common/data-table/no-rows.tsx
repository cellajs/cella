import { SearchIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';

interface NoRowsProps {
  isFiltered?: boolean;
  isFetching?: boolean;
  /** Replaces the default empty text while nothing is filtered; it pads itself, as a ContentPlaceholder does. */
  emptyContent?: ReactNode;
}

export function NoRows({ isFiltered, isFetching, emptyContent }: NoRowsProps) {
  const { t } = useTranslation();
  if (isFetching) return null;

  const resource = t('c:results').toLowerCase();
  if (isFiltered) return <ContentPlaceholder icon={SearchIcon} title="c:no_resource_found" titleProps={{ resource }} />;
  return emptyContent ?? <p className="p-8 text-center">{t('c:no_resource_yet', { resource })}</p>;
}
