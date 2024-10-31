import { queryOptions } from '@tanstack/react-query';
import { createRoute } from '@tanstack/react-router';
import { Suspense, lazy } from 'react';
import { getAttachment } from '~/api/attachments';
import { queryClient } from '~/lib/router';
import ErrorNotice from '~/modules/common/error-notice';
import type { ErrorType } from '#/lib/errors';
import { AppRoute } from './general';

//Lazy-loaded components
const AttachmentPage = lazy(() => import('~/modules/organizations/attachment-page'));

export const AttachmentRoute = createRoute({
  path: '/$orgIdOrSlug/attachment/$attachmentId',
  staticData: { pageTitle: 'Attachment', isAuth: true },
  getParentRoute: () => AppRoute,
  loader: ({ params: { orgIdOrSlug, attachmentId } }) =>
    queryClient.ensureQueryData(
      queryOptions({
        queryKey: ['attachments', orgIdOrSlug],
        queryFn: () =>
          getAttachment({
            orgIdOrSlug,
            id: attachmentId,
          }),
      }),
    ),
  errorComponent: ({ error }) => <ErrorNotice error={error as ErrorType} />,

  component: () => (
    <Suspense>
      <AttachmentPage />
    </Suspense>
  ),
});
