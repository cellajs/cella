import type React from 'react';
import type { JsxEmailComponent } from '../../renderer/types.js';

declare module 'react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      'jsx-email-raw': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement> & { dangerouslySetInnerHTML: { __html: string } }, HTMLElement>;
    }
  }
}

export interface RawProps {
  content: string;
}

/** Writes `content` into the email as it is, with no wrapper element. */
export const Raw: JsxEmailComponent<RawProps> = ({ content }) => <jsx-email-raw dangerouslySetInnerHTML={{ __html: content }} />;

Raw.displayName = 'Raw';
