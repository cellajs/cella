import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';

interface SelectRoleProps {
  roles: readonly { key: string; value: string }[];
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

const SelectRole = ({ roles, onChange, value, className }: SelectRoleProps) => {
  const { t } = useTranslation();
  return (
    <Select
      value={value === undefined ? 'all' : value}
      onValueChange={(role) => {
        onChange(role === 'all' ? undefined : role);
      }}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={t('common:placeholder.select_role')} />
      </SelectTrigger>
      <SelectContent>
        {roles.map(({ key, value }) => (
          <SelectItem key={key} value={key}>
            {t(value)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectRole;
