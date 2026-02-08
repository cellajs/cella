import { useSuspenseQuery } from '@tanstack/react-query';
import { Spinner } from '~/modules/common/spinner';
import { pageQueryOptions } from '~/modules/page/query';
import { UpdatePageForm } from '~/modules/page/update-page-form';

interface UpdatePageProps {
  pageId: string;
}

/**
 * Edit page view with the update form.
 */
function UpdatePage({ pageId }: UpdatePageProps) {
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
        <UpdatePageForm page={page} />
      </div>
    </div>
  );
}

export default UpdatePage;
