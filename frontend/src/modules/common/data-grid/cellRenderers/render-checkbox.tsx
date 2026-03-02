import { useRef } from 'react';
import { Checkbox } from '~/modules/ui/checkbox';
import type { RenderCheckboxProps } from '../types';

export function renderCheckbox({ onChange, indeterminate: _indeterminate, ...props }: RenderCheckboxProps) {
  const withShift = useRef(false);

  const handleChange = (checked: boolean) => {
    onChange(checked, withShift.current);
  };

  return (
    <Checkbox
      {...props}
      onClick={(e) => {
        withShift.current = e.nativeEvent.shiftKey;
      }}
      onCheckedChange={(checked) => {
        handleChange(!!checked);
      }}
    />
  );
}
