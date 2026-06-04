import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface RowProps extends BaseProps<'table'> {}

export const Row: JsxEmailComponent<RowProps> = ({ children, disableDefaultStyle, style, ...props }) => {
  if (props.cellPadding || props.cellSpacing) {
    console.warn(
      'Use of the `cellPadding` and `cellSpacing` properties are discouraged due to inconsistencies between email clients',
    );
  }

  return (
    <table
      align="center"
      width="100%"
      style={style}
      role="presentation"
      cellSpacing="0"
      cellPadding="0"
      border={0}
      {...props}
    >
      <tbody style={disableDefaultStyle ? {} : { width: '100%' }}>
        <tr style={disableDefaultStyle ? {} : { width: '100%' }}>{children}</tr>
      </tbody>
    </table>
  );
};

Row.displayName = 'Row';
