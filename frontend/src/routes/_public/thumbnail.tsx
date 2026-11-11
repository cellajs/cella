import { createFileRoute, notFound } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { ThumbnailPage } from '~/modules/common/thumbnail-page';

/** The link preview's composition, for `pnpm cella shoot` on a development build alone. */
export const Route = createFileRoute('/_public/thumbnail')({
  beforeLoad: () => {
    if (appConfig.mode !== 'development') throw notFound();
  },
  component: ThumbnailPage,
});
