import { SelectTrigger } from '@radix-ui/react-select';
import type { RenderEditCellProps } from 'react-data-grid';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

export const renderSelect = <T,>({
  props,
  options,
  key,
}: { props: RenderEditCellProps<T, unknown>; options: { label: string; value: string }[]; key: string }) => {
  const onChooseValue = (value: string) => props.onRowChange({ ...props.row, [key]: value }, true);

  return (
    <Select open={true} value={props.row[key as keyof T] as string} onValueChange={onChooseValue}>
      <SelectTrigger className="h-[30px] border-none p-2 text-xs tracking-wider">
        <SelectValue placeholder={props.row[key as keyof T] as string} />
      </SelectTrigger>
      <SelectContent sideOffset={-41} alignOffset={-5} className="!duration-0">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};
