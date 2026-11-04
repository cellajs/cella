import { GripVerticalIcon } from 'lucide-react';

/** The row a pointer drags, as its grip and name. */
export function RowDragPreview({ name }: { name: string }) {
  return (
    <div className="bg-background/75 inline-flex max-w-100 items-center gap-2 rounded-md border px-3 py-2 text-sm shadow-lg">
      <GripVerticalIcon className="text-muted-foreground size-3.5 shrink-0" />
      <span className="truncate font-medium">{name}</span>
    </div>
  );
}
