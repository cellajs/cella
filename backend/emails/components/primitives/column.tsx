import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface ColumnProps extends BaseProps<'td'> {
  bgColor?: string;
  bgImage?: string;
}

export const Column: JsxEmailComponent<ColumnProps> = ({ children, bgColor, bgImage, style, ...props }) => (
  <td
    // @ts-expect-error: `background` and `bgcolor` not documented
    background={bgImage}
    bgcolor={bgColor}
    {...props}
    style={style}
  >
    {children}
  </td>
);

Column.displayName = 'Column';
