import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface HtmlProps extends BaseProps<'html'> {
  enableVML?: boolean;
}

export const Html: JsxEmailComponent<HtmlProps> = ({
  children,
  lang = 'en',
  dir = 'ltr',
  enableVML = true,
  ...props
}) => (
  <html
    {...props}
    lang={lang}
    dir={dir}
    {...(enableVML
      ? {
          'xmlns:o': 'urn:schemas-microsoft-com:office:office',
          'xmlns:v': 'urn:schemas-microsoft-com:vml',
        }
      : {})}
  >
    {children}
  </html>
);

Html.displayName = 'Html';
