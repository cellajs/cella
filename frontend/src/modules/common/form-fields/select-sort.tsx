import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { TKey } from '~/lib/i18n-locales';
import { ResponsiveSelect } from '~/modules/common/form-fields/responsive-select';
import type { IconComponent } from '~/modules/common/icons/types';

interface SortOptionBase {
  name: TKey;
  value: string;
  icon: IconComponent;
}

interface SelectSortProps<T extends readonly SortOptionBase[]> {
  sortOptions: T;
  value: T[number]['value'];
  onChange: (value: T[number]['value']) => void;
  className?: string;
  iconOnly?: boolean;
}

export function SelectSort<T extends readonly SortOptionBase[]>({ sortOptions, onChange, value, className, iconOnly = true }: SelectSortProps<T>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const options = sortOptions.map((option) => ({ value: option.value, label: t(option.name), icon: <option.icon /> }));

  return (
    <ResponsiveSelect
      options={options}
      value={value}
      onChange={onChange}
      title={t('c:sort')}
      iconOnly={iconOnly}
      className={className}
      disabled={!isOnline}
    />
  );
}
