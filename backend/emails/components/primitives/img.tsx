import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface ImgProps extends BaseProps<'img'> {}

export const Img: JsxEmailComponent<ImgProps> = ({ alt, disableDefaultStyle, height, src, style, width, ...props }) => {
  return (
    <img
      {...props}
      alt={alt}
      src={src}
      width={width}
      height={height}
      style={{
        ...(disableDefaultStyle ? {} : { border: 'none', display: 'block', outline: 'none', textDecoration: 'none' }),
        ...style,
      }}
    />
  );
};

Img.displayName = 'Img';
