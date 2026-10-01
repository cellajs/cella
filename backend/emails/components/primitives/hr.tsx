import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface HrProps extends BaseProps<'hr'> {}

export const Hr: JsxEmailComponent<HrProps> = ({ disableDefaultStyle, style, ...props }) => {
  const defaultStyle = disableDefaultStyle ? {} : { border: 'none', borderTop: '1px solid #eaeaea', width: '100%' };
  return <hr {...props} style={{ ...defaultStyle, ...style }} />;
};

Hr.displayName = 'Hr';
