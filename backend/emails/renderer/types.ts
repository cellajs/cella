import type { HtmlToTextOptions } from 'html-to-text';
import type React from 'react';

/** Vendored from jsx-email v3.2.1 (MIT), excluding CLI-only types and globals. */
export type BaseProps<TElement extends React.ElementType> = React.ComponentPropsWithoutRef<TElement> & {
  disableDefaultStyle?: boolean;
};

export type JsxEmailComponent<TProps extends BaseProps<any>> = React.FC<Readonly<TProps>>;

export type PlainTextOptions = HtmlToTextOptions;

// Only `plainText` affects rendering; the remaining options preserve jsx-email API parity.
// Components control default styling through their own `disableDefaultStyle` prop.
export interface RenderOptions {
  disableDefaultStyle?: boolean;
  inlineCss?: boolean;
  minify?: boolean;
  plainText?: boolean | PlainTextOptions;
  pretty?: boolean;
}
