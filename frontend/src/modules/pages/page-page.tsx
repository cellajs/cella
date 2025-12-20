import { useSuspenseQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import Spinner from '~/modules/common/spinner';
import { pageQueryOptions } from '~/modules/pages/query';

const BlockNote = lazy(() => import('~/modules/common/blocknote'));

/**
 * Displays a page with its name as title and description as the main content.
 */
const PagePage = ({ pageId }: { pageId: string }) => {
  const pageQueryOpts = pageQueryOptions(pageId);
  const { data: page } = useSuspenseQuery(pageQueryOpts);

  return (
    <div className="container my-4 md:mt-8 mx-auto">
      <div className="prose dark:prose-invert mx-auto max-w-4xl">
        <h1>{page.name}</h1>

        {page.description && (
          <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
            <BlockNote
              id={`page-${pageId}`}
              type="preview"
              defaultValue={page.description}
              className="text-muted-foreground font-light"
              clickOpensPreview
            />
          </Suspense>
        )}
      </div>
    </div>
  );
};

export default PagePage;
