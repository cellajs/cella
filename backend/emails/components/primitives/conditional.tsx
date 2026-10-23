import type React from 'react';
import type { JsxEmailComponent } from '../../renderer/types.js';
import { Raw } from './raw.js';

export interface ConditionalProps {
  children?: React.ReactNode;
  expression?: string;
  mso?: boolean;
}

/** Wraps its children in a conditional comment: `mso` for Outlook only (`false`: all but Outlook), or an `expression`. */
export const Conditional: JsxEmailComponent<ConditionalProps> = ({ children, expression, mso }) => {
  if (typeof expression === 'undefined' && typeof mso === 'undefined')
    throw new RangeError('jsx-email: Conditional expects the `expression` or `mso` prop to be defined');

  if (typeof expression !== 'undefined' && typeof mso !== 'undefined')
    throw new RangeError('jsx-email: Conditional expects the `expression` or `mso` prop to be defined, not both');

  // Not Outlook: the closing `<!-->` makes other clients read the content as markup.
  if (mso === false) {
    return (
      <>
        <Raw content="<!--[if !mso]><!-->" />
        {children}
        <Raw content="<!--<![endif]-->" />
      </>
    );
  }

  // Older Outlook/Word parsers need the self-closing `<![endif]/-->` terminator: adjacent comments otherwise spill over.
  return (
    <>
      <Raw content={`<!--[if ${expression ?? 'mso'}]>`} />
      {children}
      <Raw content="<![endif]/-->" />
    </>
  );
};

Conditional.displayName = 'Conditional';
