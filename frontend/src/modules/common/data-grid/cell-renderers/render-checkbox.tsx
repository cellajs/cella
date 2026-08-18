import { useRef } from 'react';
import { Checkbox } from '~/modules/ui/checkbox';
import type { RenderCheckboxProps } from '../types';

export function RenderCheckbox({ onChange, indeterminate: _indeterminate, ...props }: RenderCheckboxProps) {
  const withShift = useRef(false);

  const handleChange = (checked: boolean) => {
    onChange(checked, withShift.current);
  };

  return (
    <Checkbox
      {...props}
      onMouseDown={(e) => {
        // The cell's mousedown also toggles row selection, which would cancel out this click.
        e.stopPropagation();
      }}
      onClick={(e) => {
        withShift.current = e.nativeEvent.shiftKey;
        e.stopPropagation();
      }}
      onCheckedChange={(checked) => {
        handleChange(!!checked);
      }}
    />
  );
}
