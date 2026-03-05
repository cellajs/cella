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

/**
 * Dropdown select for picking a single role, supporting both entity and system roles.
 * Renders a drawer on mobile for better touch UX.
 */
export function SelectRole({ entity = false, onChange, value, className }: SelectRoleProps) {
  const { t } = useTranslation();
  const { isOnline } = useOnlineManager();

  const roleOptions = entity ? roles.all : appConfig.systemRoles;

  const options = [
    { value: 'all', label: t('common:all') },
    ...roleOptions.map((role) => ({
      value: role,
      label: t(role, { ns: ['app', 'common'] }),
    })),
  ];

  return (
    <ResponsiveSelect
      options={options}
      value={value === undefined || value === 'all' ? 'all' : value}
      onChange={(role: string) => onChange(role === 'all' ? undefined : role)}
      placeholder={t('common:placeholder.select_role')}
      title={t('common:role')}
      className={className}
      disabled={!isOnline}
    />
  );
}
