import { BracesIcon, ChevronRightIcon, FileTextIcon, HashIcon } from 'lucide-react';
import { Fragment } from 'react';
import { getMethodColor } from '~/modules/docs/helpers/get-method-color';
import type { DocsSearchResult } from '~/modules/docs/search/types';
import { Badge } from '~/modules/ui/badge';

/** Render engine-highlighted text: `<mark>` ranges become styled spans (no raw HTML). */
function MarkedText({ text }: { text: string }) {
  const parts = text.split(/<\/?mark>/g);
  if (parts.length === 1) return <>{text}</>;
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: derived from a stable string split.
          <span key={index} className="text-primary underline underline-offset-4">
            {part}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: derived from a stable string split.
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  );
}

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

/**
 * A single search result row. Page rows carry the title; heading/text rows
 * hang under their page row with a continuous tree line and indentation
 * (adjacent rows' inset-y-0 line segments join up visually).
 */
export function DocsSearchRow({ item }: { item: DocsSearchResult }) {
  if (item.type === 'heading' || item.type === 'text') {
    return (
      <div className="relative flex w-full min-w-0 items-center gap-1.5 ps-4">
        <span aria-hidden="true" className="absolute -inset-y-2 left-1 w-px bg-border" />
        {item.type === 'heading' && <HashIcon className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className={`truncate ${item.type === 'text' ? 'text-popover-foreground/80' : ''}`}>
          <MarkedText text={item.title} />
        </span>
      </div>
    );
  }

  if (item.type === 'operation' || item.type === 'schema') {
    return (
      <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
        <Breadcrumbs crumbs={item.breadcrumbs} />
        <div className="flex w-full min-w-0 items-center gap-2">
          {item.type === 'schema' && <BracesIcon className="size-4 shrink-0 text-muted-foreground" />}
          {item.method && (
            <Badge
              variant="secondary"
              className={`shrink-0 bg-transparent p-0 text-xs uppercase shadow-none ${getMethodColor(item.method)}`}
            >
              {item.method}
            </Badge>
          )}
          <span className={`truncate font-medium ${item.deprecated ? 'line-through opacity-60' : ''}`}>
            <MarkedText text={item.title} />
          </span>
        </div>
      </div>
    );
  }

  // Page row
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-0.5">
      <Breadcrumbs crumbs={item.breadcrumbs} />
      <div className="flex w-full min-w-0 items-center gap-2">
        <FileTextIcon className="size-4 shrink-0 text-muted-foreground" />
        <span className="truncate font-medium">
          <MarkedText text={item.title} />
        </span>
      </div>
    </div>
  );
}
