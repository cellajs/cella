import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EditIcon } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { pageQueryOptions } from '~/modules/pages/query';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { dateShort } from '~/utils/date-short';

const BlockNote = lazy(() => import('~/modules/common/blocknote'));

interface ViewPageProps {
  pageId: string;
}

/**
 * Displays a page with its name as title and description as the main content.
 */
function ViewPage({ pageId }: ViewPageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { systemRole } = useUserStore();

  // Get page from React Query
  const { data: page } = useSuspenseQuery(pageQueryOptions(pageId));

  if (!page) {
    return (
      <div className="my-4 md:mt-8 mx-auto flex justify-center">
        <Spinner className="my-16 h-6 w-6" />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="mx-auto max-w-4xl">
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-2">
            {systemRole && (
              <Button variant="plain" onClick={() => navigate({ to: '/docs/page/$id/edit', params: { id: pageId } })}>
                <EditIcon size={16} className="mr-2" />
                {t('common:edit')}
              </Button>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {t('common:created_at')} {dateShort(page.createdAt)}
          </div>
        </div>

        <div className="prose dark:prose-invert">
          <h1 className="pt-2">{page.name}</h1>

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
    </div>
  );
};

export default ViewPage;
