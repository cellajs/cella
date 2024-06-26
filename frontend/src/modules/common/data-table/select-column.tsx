import { SelectTrigger } from '@radix-ui/react-select';
import type { config } from 'config';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

import type { User, Member } from '~/types';

export const renderSelect = <TRow extends User | Member>({
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
    if ('membership' in row) return onRowChange({ ...row, membership: { ...row.membership, role: value } }, true);

    onRowChange({ ...row, role: value }, true);
  };
  const role = 'membership' in row && row.membership ? row.membership.role : row.role;
  return (
    <Select open={true} value={role} onValueChange={onChooseValue}>
      <SelectTrigger className="h-[30px] border-none p-2 text-xs tracking-wider">
        <SelectValue placeholder={role} />
      </SelectTrigger>
      <SelectContent sideOffset={-41} alignOffset={-5} className="!duration-0">
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {t(`common:${option.toLowerCase()}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
