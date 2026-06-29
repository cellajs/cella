import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface TextProps extends BaseProps<'p'> {}

export const Text: JsxEmailComponent<TextProps> = ({ disableDefaultStyle, style, ...props }) => {
  return (
    <p
      {...props}
      style={{
        ...(disableDefaultStyle ? {} : { fontSize: '14px', lineHeight: '24px', margin: '16px 0' }),
        ...style,
      }}
    />
  );
};

Text.displayName = 'Text';
