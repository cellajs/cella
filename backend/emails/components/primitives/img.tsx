import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface ImgProps extends BaseProps<'img'> {}

export const Img: JsxEmailComponent<ImgProps> = ({ alt, disableDefaultStyle, height, src, style, width, ...props }) => {
  const defaultStyle = disableDefaultStyle ? {} : { border: 'none', display: 'block', outline: 'none', textDecoration: 'none' };
  return <img {...props} alt={alt} src={src} width={width} height={height} style={{ ...defaultStyle, ...style }} />;
};

Img.displayName = 'Img';
