import { ArrowLeftRightIcon, BracesIcon, ChevronRightIcon, FileTextIcon, HashIcon } from 'lucide-react';
import { Fragment } from 'react';
import { HighlightText } from '~/modules/common/match-highlight/highlight-text';
import { SearchRowIcon } from '~/modules/common/search-row-icon';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import type { DocsSearchResult } from '~/modules/docs/search/types';
import { cn } from '~/utils/cn';

function Breadcrumbs({ crumbs }: { crumbs: string[] }) {
  if (!crumbs.length) return null;
  return (
    <span className="text-muted-foreground flex items-center gap-0.5 text-xs">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb}>
          {index > 0 && <ChevronRightIcon className="size-3" />}
          <span className="truncate">{crumb}</span>
        </Fragment>
      ))}
    </span>
  );
}

const treeLineClass = 'absolute left-2 w-px bg-border';

/** Heading and text rows hang under their page row with a continuous tree line, which parts around a heading's icon. */
export function DocsSearchRow({ item }: { item: DocsSearchResult }) {
  if (item.type === 'heading' || item.type === 'text') {
    return (
      <div className="relative flex w-full min-w-0 items-center gap-2">
        {item.type === 'heading' ? (
          <>
            <span aria-hidden="true" className={cn(treeLineClass, '-top-2 bottom-[calc(50%+0.625rem)]')} />
            <span aria-hidden="true" className={cn(treeLineClass, 'top-[calc(50%+0.625rem)] -bottom-2')} />
          </>
        ) : (
          <span aria-hidden="true" className={cn(treeLineClass, '-inset-y-2')} />
        )}
        <SearchRowIcon>{item.type === 'heading' && <HashIcon className="text-muted-foreground size-3.5" />}</SearchRowIcon>
        <span className={cn('truncate', item.type === 'text' && 'text-muted-foreground')}>
          <HighlightText text={item.title} />
        </span>
      </div>
    );
  }

  const LeadingIcon = item.method ? ArrowLeftRightIcon : item.type === 'schema' ? BracesIcon : FileTextIcon;
  return (
    <div className="flex w-full min-w-0 items-end gap-2">
      {/* h-5 is the title's line: the icon and method stay on it under a breadcrumb */}
      <SearchRowIcon className="h-5">
        <LeadingIcon className="text-muted-foreground" />
      </SearchRowIcon>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <Breadcrumbs crumbs={item.breadcrumbs} />
        <span className={cn('truncate font-medium', item.deprecated && 'text-muted-foreground line-through')}>
          <HighlightText text={item.title} />
        </span>
      </div>
      {/* After the title: its width differs per method, and text keeps one column */}
      {item.method && (
        <span className="flex h-5 items-center">
          <MethodLabel method={item.method} />
        </span>
      )}
    </div>
  );
}
