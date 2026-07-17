import type { HtmlToTextOptions } from 'html-to-text';
import type React from 'react';

/** Vendored from jsx-email v3.2.1 (MIT), excluding CLI-only types and globals. */
export type BaseProps<TElement extends React.ElementType> = React.ComponentPropsWithoutRef<TElement> & {
  disableDefaultStyle?: boolean;
};

export type JsxEmailComponent<TProps extends BaseProps<any>> = React.FC<Readonly<TProps>>;

export type PlainTextOptions = HtmlToTextOptions;

// `plainText` is the only render option this fork acts on. `disableDefaultStyle`,
// `inlineCss`, `minify` and `pretty` are kept for API parity with jsx-email but
// are inert here: this fork dropped the inline/minify/pretty plugins, and
// per-component default styling is controlled by each component's own
// `disableDefaultStyle` prop (see `BaseProps`).
export interface RenderOptions {
  disableDefaultStyle?: boolean;
  inlineCss?: boolean;
  minify?: boolean;
  plainText?: boolean | PlainTextOptions;
  pretty?: boolean;
}
