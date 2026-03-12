import type { HTMLAttributes } from 'react';
import { useUIStore } from '~/store/ui';
import { cn } from '~/utils/cn';

import '@blocknote/shadcn/style.css';
import '~/modules/common/blocknote/styles.css';

type BlockNoteMinimalHtmlProps = {
  html: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * Lightweight component for rendering pre-generated HTML strings (e.g. task summaries)
 * with BlockNote styling. For rendering full BlockNote JSON content, use BlockNoteFullHtml instead.
 */
export const BlockNoteMinimalHtml = ({ html: __html, className = '', ...rest }: BlockNoteMinimalHtmlProps) => {
  const mode = useUIStore.getState().mode;

  return (
    <div
      className={cn(className, `bn-container bn-dense bn-shadcn bn-default-styles ${mode}`)}
      data-color-scheme={mode}
      {...rest}
    >
      <p dangerouslySetInnerHTML={{ __html }} />
    </div>
  );
};
