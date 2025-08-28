import { Search } from 'lucide-react';
import 'react-data-grid/lib/styles.css';
import { useTranslation } from 'react-i18next';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import '~/modules/common/data-table/style.css';

interface NoRowsProps {
  isFiltered?: boolean;
  isFetching?: boolean;
  customComponent?: React.ReactNode;
}
// When there are no rows, this component is displayed
export const NoRows = ({ isFiltered, isFetching, customComponent }: NoRowsProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center w-full p-8">
      {isFiltered && !isFetching && (
        <ContentPlaceholder icon={Search} title={t('common:no_resource_found', { resource: t('common:results').toLowerCase() })} />
      )}
      {!isFiltered && !isFetching && (customComponent ?? t('common:no_resource_yet', { resource: t('common:results').toLowerCase() }))}
    </div>
  );
};
