import { createFileRoute } from '@tanstack/react-router';
import { errorSearchSchema } from '~/modules/common/search-params-schemas';
import { ErrorNoticePageComponent } from '~/routes/route-utils';
import appTitle from '~/utils/app-title';

/**
 * Generic error page for displaying application errors.
 */
export const Route = createFileRoute('/_public/error')({
  validateSearch: errorSearchSchema,
  staticData: { isAuth: false },
  head: () => ({ meta: [{ title: appTitle('Error') }] }),
  component: ErrorNoticePageComponent,
});
