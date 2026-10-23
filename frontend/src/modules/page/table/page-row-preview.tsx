import { GripVerticalIcon } from 'lucide-react';
import type { DocPage } from '~/modules/page/content';

interface PageRowPreviewProps {
  page: DocPage;
}

export function PageRowPreview({ page }: PageRowPreviewProps) {
  return (
    <div className="inline-flex max-w-100 items-center gap-2 rounded-md border bg-background/90 px-3 py-2 text-sm opacity-80 shadow-lg">
      <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{page.name}</span>
    </div>
  );
}
