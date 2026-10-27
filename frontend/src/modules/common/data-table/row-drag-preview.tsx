import { GripVerticalIcon } from 'lucide-react';

/** The row a pointer drags, as its grip and name. */
export function RowDragPreview({ name }: { name: string }) {
  return (
    <div className="inline-flex max-w-100 items-center gap-2 rounded-md border bg-background/75 px-3 py-2 text-sm shadow-lg">
      <GripVerticalIcon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate font-medium">{name}</span>
    </div>
  );
}
