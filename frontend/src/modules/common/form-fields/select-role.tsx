import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import type { ContextEntity } from '~/types/common';
import { cn } from '~/utils/utils';

interface SelectRoleProps {
  entityType?: ContextEntity;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

const SelectRole = ({ entityType, onChange, value, className }: SelectRoleProps) => {
  const { t } = useTranslation();

  const roles = entityType ? config.rolesByType.entityRoles : config.rolesByType.systemRoles;

  return (
    <Select
      value={value === undefined || value === 'all' ? 'all' : value}
      onValueChange={(role) => {
        onChange(role === 'all' ? undefined : role);
      }}
    >
      <SelectTrigger className={cn('w-full', className)}>
        <SelectValue placeholder={t('common:placeholder.select_role')} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={'all'}> {t('common:all')}</SelectItem>
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {t(role)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectRole;
