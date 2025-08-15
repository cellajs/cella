import { appConfig } from 'config';
import type { LucideProps } from 'lucide-react';
import type { ForwardRefExoticComponent, RefAttributes } from 'react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

// Base option type
type SortOptionBase = {
  name: string;
  value: string;
  icon: ForwardRefExoticComponent<Omit<LucideProps, 'ref'> & RefAttributes<SVGSVGElement>>;
};

// Inferred from sortOptions passed in
interface SelectSortProps<T extends readonly SortOptionBase[]> {
  sortOptions: T;
  value: T[number]['value'];
  onChange: (value: T[number]['value']) => void;
  className?: string;
  iconOnly?: boolean;
}

function SelectSort<T extends readonly SortOptionBase[]>({ sortOptions, onChange, value, className, iconOnly = true }: SelectSortProps<T>) {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const selected = sortOptions.find((option) => option.value === value) ?? sortOptions[0];

  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger disabled={!isOnline} className={cn('w-auto', className)}>
        {iconOnly ? <selected.icon size={16} strokeWidth={appConfig.theme.strokeWidth} /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent align="end" className="min-w-48">
        {sortOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <option.icon size={16} strokeWidth={appConfig.theme.strokeWidth} />
              <span>{t(option.name)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export default SelectSort;
