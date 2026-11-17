import { createFileRoute, notFound } from '@tanstack/react-router';
import { appConfig } from 'shared';
import { fileKindNames } from 'shared/utils/file-kind';
import { z } from 'zod';
import { FileKindThumbnail, ThumbnailPage } from '~/modules/common/thumbnail-page';

/** The link preview's composition, or with `file` that of a file's share link, for `pnpm cella shoot` on a development build alone. */
export const Route = createFileRoute('/_public/thumbnail')({
  validateSearch: z.object({ file: z.enum(fileKindNames).optional() }),
  beforeLoad: () => {
    if (appConfig.mode !== 'development') throw notFound();
  },
  component: Thumbnail,
});

function Thumbnail() {
  const file = Route.useSearch({ select: (search) => search.file });
  return file ? <FileKindThumbnail kind={file} /> : <ThumbnailPage />;
}
