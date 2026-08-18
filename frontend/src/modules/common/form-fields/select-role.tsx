import { useTranslation } from 'react-i18next';
import { appConfig, roles } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ResponsiveSelect } from '~/modules/ui/responsive-select';

interface SelectRoleProps {
  entity?: boolean;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

/** Single-role select over entity and system roles. Renders a drawer on mobile. */
export function SelectRole({ entity = false, onChange, value, className }: SelectRoleProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const roleOptions = entity ? roles.all : appConfig.systemRoles;

  const options = [
    { value: 'all', label: t('c:all') },
    ...roleOptions.map((role) => ({
      value: role,
      label: t(role),
    })),
  ];

  return (
    <ResponsiveSelect
      options={options}
      value={value === undefined || value === 'all' ? 'all' : value}
      onChange={(role: string) => onChange(role === 'all' ? undefined : role)}
      placeholder={t('c:placeholder.select_role')}
      title={t('c:role')}
      className={className}
      disabled={!isOnline}
    />
  );
}
