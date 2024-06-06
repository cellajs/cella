import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { cn } from '~/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import type { ContextEntity } from '~/types';

interface SelectRoleProps {
  entityType?: ContextEntity;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

const SelectRole = ({ entityType, onChange, value, className }: SelectRoleProps) => {
  const { t } = useTranslation();

  const roles = entityType ? config.entityRoles : config.systemRoles;

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
        {roles.map((role) => (
          <SelectItem key={role} value={role}>
            {t(`common:${role.toLowerCase()}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

export default SelectRole;
