import type { RenderCheckboxProps } from '../types';

const checkboxClassname = 'rdg-checkbox-input';

export function renderCheckbox({ onChange, indeterminate, ...props }: RenderCheckboxProps) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.checked, (e.nativeEvent as MouseEvent).shiftKey);
  }

  return (
    <input
      ref={(el) => {
        if (el) {
          el.indeterminate = indeterminate === true;
        }
      }}
      type="checkbox"
      className={checkboxClassname}
      onChange={handleChange}
      {...props}
    />
  );
}
