import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface HrProps extends BaseProps<'hr'> {}

export const Hr: JsxEmailComponent<HrProps> = ({ disableDefaultStyle, style, ...props }) => {
  return (
    <hr
      {...props}
      style={{
        ...(disableDefaultStyle
          ? {}
          : {
              border: 'none',
              borderTop: '1px solid #eaeaea',
              width: '100%',
            }),
        ...style,
      }}
    />
  );
};

Hr.displayName = 'Hr';
