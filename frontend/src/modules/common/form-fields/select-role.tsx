import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ResponsiveSelect } from '~/modules/ui/responsive-select';

interface SelectRoleProps {
  /** Restrict options to this channel entity's role vocabulary; omit for system roles. */
  entityType?: ChannelEntityType;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

/** Single-role select. Renders a drawer on mobile. */
export function SelectRole({ entityType, onChange, value, className }: SelectRoleProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const roleOptions = entityType ? hierarchy.getRoles(entityType) : appConfig.systemRoles;

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
