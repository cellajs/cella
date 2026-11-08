import { useRef } from 'react';
import { Checkbox } from '~/modules/ui/checkbox';

interface RenderCheckboxProps extends Pick<React.ComponentProps<'input'>, 'aria-label' | 'aria-labelledby' | 'checked' | 'tabIndex' | 'disabled'> {
  indeterminate?: boolean | undefined;
  onChange: (checked: boolean, shift: boolean) => void;
}

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
