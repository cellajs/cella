import { cn } from '~/utils/cn';

/** The `prose` wrapper sizes the h1; it is scoped to the heading so the cards and tables below keep their styles. */
export function DocsPageHeader({ title, className }: { title: string; className?: string }) {
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <h1 className="pt-6">{title}</h1>
    </div>
  );
}
