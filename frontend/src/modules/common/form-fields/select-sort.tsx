import { config } from 'config';
import { ArrowDownAZ, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

interface Props {
  onChange: (value?: string) => void;
  value: string;
  className?: string;
  iconOnly?: boolean;
}

const sortOptions = [
  { name: 'common:alphabetical', icon: ArrowDownAZ, value: 'name' },
  { name: 'common:created_at', icon: Calendar, value: 'createdAt' },
];

const SelectSort = ({ onChange, value, className, iconOnly = true }: Props) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const selected = sortOptions.find((option) => option.value === value) || sortOptions[0];

  return (
    <Select value={value} onValueChange={(sort) => onChange(sort)}>
      <SelectTrigger disabled={!isOnline} className={cn('w-auto', className)}>
        {iconOnly ? <selected.icon size={16} strokeWidth={config.theme.strokeWidth} /> : <SelectValue />}
      </SelectTrigger>
      <SelectContent align="end" className="min-w-48">
        {sortOptions.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            <div className="flex items-center gap-2">
              <option.icon size={16} strokeWidth={config.theme.strokeWidth} />
              <span>{t(option.name)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectSort;
