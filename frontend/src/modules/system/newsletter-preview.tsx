import { Suspense } from 'react';
import { appConfig } from 'shared';
import { systemUploadPrefix } from 'shared/utils/upload-visibility';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { Spinner } from '~/modules/common/spinner';
import { newsletterFormId } from '~/modules/system/create-newsletter-form';

export function NewsletterPreview() {
  // The write tab saves its draft when it unmounts, so the store holds what it last showed.
  const draft = useDraftStore((state) => state.getForm<{ subject?: string; content?: string }>(newsletterFormId));

  return (
    <div className="mt-5 flex max-w-full flex-col items-center leading-normal">
      <section className="w-full rounded-lg border p-6">
        <h2 className="mb-4 font-semibold text-lg text-muted-foreground">{draft?.subject}</h2>

        <Suspense fallback={<Spinner className="my-16" noDelay />}>
          <BlockNoteFullHtml
            id={`${appConfig.name}-newsletter-preview-content`}
            defaultValue={draft?.content ?? ''}
            className="text-muted-foreground"
            clickOpensPreview
            organizationId={systemUploadPrefix}
          />
        </Suspense>
      </section>
    </div>
  );
}
