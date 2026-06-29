import { Text as JsxText } from './primitives';

/**
 * EmailText wrapper that overrides jsx-email's default styles (14px/24px/16px margin)
 * with our preferred email typography defaults.
 */
export const EmailText = ({ style, ...props }: React.ComponentProps<typeof JsxText>) => (
  <JsxText
    disableDefaultStyle
    style={{ fontSize: '0.875rem', lineHeight: '1.3rem', margin: '0.5rem 0', ...style }}
    {...props}
  />
);

// Template export
export const Template = EmailText;
