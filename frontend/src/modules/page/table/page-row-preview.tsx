import { GripVerticalIcon } from 'lucide-react';
import type { DocPage } from '~/modules/page/content';

/** Styled preview rendered under the cursor while a page row is being dragged. */
export function PageRowPreview({ page }: { page: DocPage }) {
  return (
    <div className="inline-flex max-w-100 items-center gap-2 rounded-md border bg-background/90 px-3 py-2 text-sm opacity-80 shadow-lg">
      <GripVerticalIcon size={14} className="shrink-0 text-muted-foreground/50" />
      <span className="overflow-hidden text-ellipsis whitespace-nowrap font-medium">{page.name || 'Untitled'}</span>
    </div>
  );
}
