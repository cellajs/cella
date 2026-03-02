import type { RenderCheckboxProps } from '../types';
import { renderCheckbox as defaultRenderCheckbox } from './render-checkbox';

type SharedInputProps = Pick<
  RenderCheckboxProps,
  'disabled' | 'tabIndex' | 'aria-label' | 'aria-labelledby' | 'indeterminate' | 'onChange'
>;

interface SelectCellFormatterProps extends SharedInputProps {
  value: boolean;
}

export function SelectCellFormatter({
  value,
  tabIndex,
  indeterminate,
  disabled,
  onChange,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
}: SelectCellFormatterProps) {
  return defaultRenderCheckbox({
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    tabIndex,
    indeterminate,
    disabled,
    checked: value,
    onChange,
  });
}
