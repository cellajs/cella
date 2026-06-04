import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface BodyProps extends BaseProps<'body'> {}

export const Body: JsxEmailComponent<BodyProps> = ({ children, style, ...props }) => (
  <body {...props} style={style}>
    {children}
  </body>
);

Body.displayName = 'Body';
