import { SelectTrigger } from '@radix-ui/react-select';
import type { appConfig } from 'config';
import { useTranslation } from 'react-i18next';
import type { Member } from '~/modules/memberships/types';
import type { OrganizationTable } from '~/modules/organizations/table/table-wrapper';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';
import type { User } from '~/modules/users/types';

export const renderSelect = <TRow extends User | Member | OrganizationTable>({
  row,
  options,
  onRowChange,
}: {
  row: TRow;
  onRowChange: (row: TRow, commitChanges?: boolean) => void;
  options: typeof appConfig.rolesByType.entityRoles | typeof appConfig.rolesByType.systemRoles;
}) => {
  const { t } = useTranslation();

  // SetTimeout to avoid flushSync was called from inside a lifecycle method
  const onChooseValue = (value: string) => {
    // Member | Organization type
    if ('membership' in row) {
      return setTimeout(() => onRowChange({ ...row, membership: { ...row.membership, role: value } }, true));
    }
    // User type
    if ('role' in row) {
      return setTimeout(() => onRowChange({ ...row, role: value } as TRow, true));
    }
  };

  // Determine role based on type
  const role = 'membership' in row && row.membership ? row.membership.role : 'role' in row ? row.role : undefined;
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
