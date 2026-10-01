import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

type RootProps = BaseProps<'a'>;

export interface LinkProps extends RootProps {}

export const Link: JsxEmailComponent<LinkProps> = ({ disableDefaultStyle, style, target, ...props }) => {
  const defaultStyle = disableDefaultStyle ? {} : { color: '#067df7', textDecoration: 'none' };
  return <a {...props} target={target} style={{ ...defaultStyle, ...style }} />;
};

Link.displayName = 'Link';
