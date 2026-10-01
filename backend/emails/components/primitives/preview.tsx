import type { BaseProps, JsxEmailComponent } from '../../renderer/types.js';

export interface PreviewProps extends BaseProps<'div'> {}

const maxLength = 150;

export const renderWhiteSpace = (text: string) => {
  if (text.length >= maxLength) return null;

  const whiteSpaceCodes = '\xa0\u200C\u200B\u200D\u200E\u200F\uFEFF';
  return <div>{whiteSpaceCodes.repeat(maxLength - text.length)}</div>;
};

export const Preview: JsxEmailComponent<PreviewProps> = ({ children = '', ...props }) => {
  const childText = Array.isArray(children) ? children.join('') : children;
  const text = String(childText ?? '').substring(0, maxLength);

  return (
    <div
      data-skip="true"
      style={{
        display: 'none',
        lineHeight: '1px',
        maxHeight: 0,
        maxWidth: 0,
        opacity: 0,
        overflow: 'hidden',
      }}
      {...props}
    >
      {text}
      {renderWhiteSpace(text)}
    </div>
  );
};

Preview.displayName = 'Preview';
