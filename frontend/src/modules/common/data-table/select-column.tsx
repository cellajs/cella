import { SelectTrigger } from '@radix-ui/react-select';
import type { config } from 'config';
import type { RenderEditCellProps } from 'react-data-grid';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

export const renderSelect = <T,>({
  props,
  options,
  key,
}: {
  props: RenderEditCellProps<T, unknown>;
  options: typeof config.rolesByType.entityRoles | typeof config.rolesByType.systemRoles;
  key: string;
}) => {
  const onChooseValue = (value: string) => props.onRowChange({ ...props.row, [key]: value }, true);
  const { t } = useTranslation();
  return (
    <Select open={true} value={props.row[key as keyof T] as string} onValueChange={onChooseValue}>
      <SelectTrigger className="h-[30px] border-none p-2 text-xs tracking-wider">
        <SelectValue placeholder={props.row[key as keyof T] as string} />
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

