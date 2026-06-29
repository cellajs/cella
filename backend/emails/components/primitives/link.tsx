import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

type RootProps = BaseProps<'a'>;

export interface LinkProps extends RootProps {}

export const Link: JsxEmailComponent<LinkProps> = ({ disableDefaultStyle, style, target, ...props }) => {
  return (
    <a
      {...props}
      target={target}
      style={{
        ...(disableDefaultStyle ? {} : { color: '#067df7', textDecoration: 'none' }),
        ...style,
      }}
    />
  );
};

Link.displayName = 'Link';
