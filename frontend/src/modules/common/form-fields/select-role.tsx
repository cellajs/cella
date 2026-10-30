import { useTranslation } from 'react-i18next';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { ResponsiveSelect } from '~/modules/common/form-fields/responsive-select';

interface SelectRoleProps {
  /** Restrict options to this channel entity's role vocabulary; omit for system roles. */
  entityType?: ChannelEntityType;
  onChange: (value?: string) => void;
  value?: string;
  className?: string;
}

/** A role filter; no role selected reads and writes `undefined`. */
export function SelectRole({ entityType, onChange, value, className }: SelectRoleProps) {
  const { t } = useTranslation();
  const isOnline = useOnlineManager();

  const roleOptions = entityType ? hierarchy.getRoles(entityType) : appConfig.systemRoles;

  const options = roleOptions.map((role) => ({ value: role, label: t(role) }));

  return (
    <ResponsiveSelect
      options={options}
      value={value}
      onChange={onChange}
      onClear={() => onChange(undefined)}
      title={t('c:role')}
      showTitle
      align="start"
      className={className}
      disabled={!isOnline}
    />
  );
}
