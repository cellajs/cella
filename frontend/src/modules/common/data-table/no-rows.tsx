import { SearchIcon } from 'lucide-react';
import '~/modules/common/data-grid/style/data-grid.css';
import { useTranslation } from 'react-i18next';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';

interface NoRowsProps {
  isFiltered?: boolean;
  isFetching?: boolean;
  customComponent?: React.ReactNode;
}
// When there are no rows, this component is displayed
export const NoRows = ({ isFiltered, isFetching, customComponent }: NoRowsProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex w-full flex-col items-center justify-center p-8">
      {isFiltered && !isFetching && (
        <ContentPlaceholder
          icon={SearchIcon}
          title="c:no_resource_found"
          titleProps={{ resource: t('c:results').toLowerCase() }}
        />
      )}
      {!isFiltered &&
        !isFetching &&
        (customComponent ?? t('c:no_resource_yet', { resource: t('c:results').toLowerCase() }))}
    </div>
  );
};
