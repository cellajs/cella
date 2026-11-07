import { useRef } from 'react';
import { Checkbox } from '~/modules/ui/checkbox';
import type { RenderCheckboxProps } from '../types';

export function RenderCheckbox({ onChange, ...props }: RenderCheckboxProps) {
  const withShift = useRef(false);

  return (
    <Checkbox
      {...props}
      onClick={(e) => {
        withShift.current = e.nativeEvent.shiftKey;
        e.stopPropagation();
      }}
      onCheckedChange={(checked) => onChange(!!checked, withShift.current)}
    />
  );
}
