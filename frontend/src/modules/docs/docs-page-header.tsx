import { cn } from '~/utils/cn';

interface DocsPageHeaderProps {
  title: string;
  className?: string;
}

/**
 * Page title for docs pages that are not MDX content (operations, schemas). The `prose` wrapper is
 * what gives the h1 its size and weight, so generated pages match a written one (see view-page).
 * Scoped to the heading only: the rest of these pages is cards and tables, which prose would restyle.
 */
export const DocsPageHeader = ({ title, className }: DocsPageHeaderProps) => (
  <div className={cn('prose dark:prose-invert max-w-none', className)}>
    <h1 className="pt-6">{title}</h1>
  </div>
);
