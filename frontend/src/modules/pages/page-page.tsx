import { useSuspenseQuery } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { ArrowLeft, Edit, Eye } from 'lucide-react';
import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { pageQueryOptions } from '~/modules/pages/query';
import UpdatePageForm from '~/modules/pages/update-page-form';
import { Button, buttonVariants } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';
import { dateShort } from '~/utils/date-short';
import { PageRouteSearchParams } from './types';

const BlockNote = lazy(() => import('~/modules/common/blocknote'));

interface PagePageProps {
  pageId: string;
  mode?: PageRouteSearchParams['mode'];
}

/**
 * Displays a page with its name as title and description as the main content.
 * In edit mode, shows the update form instead.
 */
const PagePage = ({ pageId, mode = 'view' }: PagePageProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { user } = useUserStore();

  const pageQueryOpts = pageQueryOptions(pageId);
  const { data: page } = useSuspenseQuery(pageQueryOpts);

  const toggleMode = () => {
    navigate({
      to: '/page/$id',
      replace: true,
      params: { id: pageId },
      search: { mode: mode === 'view' ? 'edit' : 'view' },
    });
  };

  const headerSection = (
    <div className="flex items-center justify-between gap-3 mb-6">
      <div className="flex items-center gap-2">
        {user && (
          <Link to="/home" className={cn(buttonVariants({ variant: 'link', size: 'default' }))}>
            <ArrowLeft size={16} />
            <span className="ml-1 max-sm:hidden">{t('common:back_to_app')}</span>
          </Link>
        )}
        <Button variant="plain" onClick={toggleMode}>
          {mode === 'view' ? (
            <>
              <Edit size={16} className="mr-2" />
              {t('common:edit')}
            </>
          ) : (
            <>
              <Eye size={16} className="mr-2" />
              {t('common:view')}
            </>
          )}
        </Button>
      </div>
      <div className="text-sm text-muted-foreground">
        {t('common:created_at')} {dateShort(page.createdAt)}
      </div>
    </div>
  );

  if (mode === 'edit') {
    return (
      <div className="container my-4 md:mt-8 mx-auto">
        <div className="mx-auto max-w-4xl">
          {headerSection}
          <UpdatePageForm
            page={page}
            callback={() => {
              navigate({ to: '/page/$id', params: { id: pageId }, search: { mode: 'view' }, replace: true });
            }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="container my-4 md:mt-8 mx-auto">
      <div className="mx-auto max-w-4xl">
        {headerSection}
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

export default PagePage;
