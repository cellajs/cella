import { SelectTrigger } from '@radix-ui/react-select';
import type { RenderEditCellProps } from 'react-data-grid';
import { Select, SelectContent, SelectItem, SelectValue } from '~/modules/ui/select';

export const renderSelect =
  <R,>(
    key: keyof R & string,
    options: {
      label: string;
      value: string;
    }[],
  ) =>
  ({ row, onRowChange }: RenderEditCellProps<R>) => {
    const onChooseValue = (value: string) => onRowChange({ ...row, [key]: value }, true);

    return (
      <Select open={true} value={row[key] as string} onValueChange={onChooseValue}>
        <SelectTrigger className="h-[30px] border-none p-2 text-xs tracking-wider">
          <SelectValue placeholder={row[key] as string} />
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
