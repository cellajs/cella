import { CloudOffIcon, GripVerticalIcon } from 'lucide-react';
import type { Page } from 'sdk';

/** A styled preview component rendered during row drag operations */
export function PageRowPreview({ page }: { page: Page }) {
  const isLocal = '_optimistic' in page;

  return (
    <div className="inline-flex max-w-[400px] items-center gap-2 rounded-md border bg-background/90 px-3 py-2 text-sm opacity-80 shadow-lg">
      <GripVerticalIcon size={14} className="shrink-0 text-muted-foreground/50" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{page.name || 'Untitled'}</span>
      {isLocal && <CloudOffIcon className="shrink-0 opacity-50" size={14} />}
    </div>
  );
}
