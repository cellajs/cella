import { BracesIcon, ChevronRightIcon, FileTextIcon, HashIcon } from 'lucide-react';
import { Fragment } from 'react';
import { HighlightText } from '~/modules/common/match-highlight';
import { MethodLabel } from '~/modules/docs/operations/method-label';
import type { DocsSearchResult } from '~/modules/docs/search/types';
import { cn } from '~/utils/cn';

function Breadcrumbs({ crumbs }: { crumbs: string[] }) {
  if (!crumbs.length) return null;
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      {crumbs.map((crumb, index) => (
        <Fragment key={crumb}>
          {index > 0 && <ChevronRightIcon className="size-3 shrink-0" />}
          <span className="truncate">{crumb}</span>
        </Fragment>
      ))}
    </span>
  );
}

/** Heading and text rows hang under their page row with a continuous tree line. */
export function DocsSearchRow({ item }: { item: DocsSearchResult }) {
  if (item.type === 'heading' || item.type === 'text') {
    return (
      <div className="relative flex w-full min-w-0 items-center gap-1.5 ps-4">
        <span aria-hidden="true" className="absolute -inset-y-2 left-1 w-px bg-border" />
        {item.type === 'heading' && <HashIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className={cn('truncate', item.type === 'text' && 'text-popover-foreground/80')}>
          <HighlightText text={item.title} />
        </span>
      </div>
    );
  }

  // Operation rows lead with their method, schema and page rows with an icon
  const LeadingIcon = item.type === 'schema' ? BracesIcon : FileTextIcon;
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
      <Breadcrumbs crumbs={item.breadcrumbs} />
      <div className="flex w-full min-w-0 items-center gap-2">
        {item.method ? <MethodLabel method={item.method} /> : <LeadingIcon className="size-4 shrink-0 text-muted-foreground" />}
        <span className={cn('truncate font-medium', item.deprecated && 'line-through opacity-60')}>
          <HighlightText text={item.title} />
        </span>
      </div>
    </div>
  );
}
