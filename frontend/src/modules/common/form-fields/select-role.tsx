import { config } from 'config';
import { useTranslation } from 'react-i18next';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '~/modules/ui/select';
import { cn } from '~/utils/cn';

interface SelectRoleProps {
  entity?: boolean;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

const SelectRole = ({ entity = false, onChange, value, className }: SelectRoleProps) => {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const roles = entity ? config.rolesByType.entityRoles : config.rolesByType.systemRoles;

  return (
    <Select value={value === undefined || value === 'all' ? 'all' : value} onValueChange={(role) => onChange(role === 'all' ? undefined : role)}>
      <SelectTrigger disabled={!isOnline} className={cn('w-full', className)}>
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
