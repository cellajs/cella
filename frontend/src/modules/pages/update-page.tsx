import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { EyeIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Spinner from '~/modules/common/spinner';
import { pageQueryOptions } from '~/modules/pages/query';
import UpdatePageForm from '~/modules/pages/update-page-form';
import { Button } from '~/modules/ui/button';
import { dateShort } from '~/utils/date-short';

interface UpdatePageProps {
  pageId: string;
}

/**
 * Edit page view with the update form.
 */
function UpdatePage({ pageId }: UpdatePageProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
            <Button variant="plain" onClick={() => navigate({ to: '/docs/page/$id', params: { id: pageId } })}>
              <EyeIcon size={16} className="mr-2" />
              {t('common:view')}
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            {t('common:created_at')} {dateShort(page.createdAt)}
          </div>
        </div>

        <UpdatePageForm page={page} />
      </div>
    </div>
  );
};

export default UpdatePage;
