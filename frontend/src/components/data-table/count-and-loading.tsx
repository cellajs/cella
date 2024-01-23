import { Loader2, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

interface Props {
  count?: number;
  isLoading?: boolean;
  singular: string;
  plural: string;
  isFiltered?: boolean;
  onResetFilters?: () => void;
}

const CountAndLoading = ({ count, singular, plural, isFiltered, onResetFilters, isLoading }: Props) => {
  const { t } = useTranslation();

  return (
    <div className="text-muted-foreground text-sm pl-2 pr-4 flex items-center">
      {isLoading ? (
        <Loader2 className="animate-spin" />
      ) : (
        count !== undefined && (
          <>
            <div className="w-max">
              {count} {count === 1 ? singular : plural}
              {isFiltered && ' '}
              {isFiltered &&
                t('label.found', {
                  defaultValue: 'found.',
                })}
            </div>
            {isFiltered && (
              <Button variant="link" onClick={onResetFilters}>
                <XCircle size={16} className="mr-1" />
                Clear
              </Button>
            )}
          </>
        )
      )}
    </div>
  );
};

export default CountAndLoading;
