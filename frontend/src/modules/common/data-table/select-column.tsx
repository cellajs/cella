import { SelectTrigger } from '@radix-ui/react-select';
import { useTranslation } from 'react-i18next';
import type { appConfig, roles } from 'shared';
import type { User } from '~/api.gen';
import type { Member } from '~/modules/memberships/types';
import type { OrganizationWithMembership } from '~/modules/organization/types';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

export const renderSelect = <TRow extends User | Member | OrganizationWithMembership>({
  row,
  options,
  onRowChange,
}: {
  row: TRow;
  onRowChange: (row: TRow, commitChanges?: boolean) => void;
  options: typeof roles.all | typeof appConfig.systemRoles;
}) => {
  const { t } = useTranslation();

  // SetTimeout to avoid flushSync was called from inside a lifecycle method
  const onChooseValue = (value: string) => {
    // Member type (has membership property in type)
    if ('membership' in row) {
      return setTimeout(() => onRowChange({ ...row, membership: { ...row.membership, role: value } }, true));
    }
    // Organization type (entityType === 'organization') - may not have membership yet
    if ('entityType' in row && row.entityType === 'organization') {
      return setTimeout(() => onRowChange({ ...row, membership: { ...row.membership, role: value } } as TRow, true));
    }
    // User type
    if ('role' in row) {
      return setTimeout(() => onRowChange({ ...row, role: value } as TRow, true));
    }
  };

  // Determine role based on type
  const role = 'membership' in row && row.membership ? row.membership.role : undefined;
  return (
    <Select open={true} value={role} onValueChange={onChooseValue}>
      <SelectTrigger className="h-8 border-none p-2 text-xs tracking-wider">
        <SelectValue placeholder={role} />
      </SelectTrigger>
      <SelectContent sideOffset={-41} alignOffset={-5} className="duration-0!">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {t(option, { ns: ['app', 'common'] })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
