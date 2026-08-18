import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import type { TKey } from '~/lib/i18n-locales';
import type { IconComponent } from '~/modules/common/icons/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

type SortOptionBase = {
  name: TKey;
  value: string;
  icon: IconComponent;
};

interface SelectSortProps<T extends readonly SortOptionBase[]> {
  sortOptions: T;
  value: T[number]['value'];
  onChange: (value: T[number]['value']) => void;
  className?: string;
  iconOnly?: boolean;
}

export function SelectSort<T extends readonly SortOptionBase[]>({
  sortOptions,
  onChange,
  value,
  className,
  iconOnly = true,
}: SelectSortProps<T>) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const selected = sortOptions.find((option) => option.value === value) ?? sortOptions[0];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger disabled={!isOnline} className={cn('w-auto', className)}>
        {iconOnly ? <selected.icon /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent align="end" className="min-w-48">
        {sortOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <option.icon />
              <span>{t(option.name)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
