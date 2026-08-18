import { cn } from '~/utils/cn';

interface DocsPageHeaderProps {
  title: string;
  className?: string;
}

/** The `prose` wrapper sizes the h1; it is scoped to the heading so the cards and tables below keep their styles. */
export function DocsPageHeader({ title, className }: DocsPageHeaderProps) {
  return (
    <div className={cn('prose dark:prose-invert max-w-none', className)}>
      <h1 className="pt-6">{title}</h1>
    </div>
  );
}
