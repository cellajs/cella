import { SelectTrigger } from '@radix-ui/react-select';
import type { config } from 'config';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

import type { Member } from '~/modules/memberships/types';
import type { Organization } from '~/modules/organizations/types';
import type { User } from '~/modules/users/types';

export const renderSelect = <TRow extends User | Member | Organization>({
  row,
  options,
  onRowChange,
}: {
  row: TRow;
  onRowChange: (row: TRow, commitChanges?: boolean) => void;
  options: typeof config.rolesByType.entityRoles | typeof config.rolesByType.systemRoles;
}) => {
  const { t } = useTranslation();

  const onChooseValue = (value: string) => {
    // Member | Organization type
    if ('membership' in row) return onRowChange({ ...row, membership: { ...row.membership, role: value } }, true);
    // User type
    if ('role' in row) onRowChange({ ...row, role: value } as TRow, true);
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
            {t(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
