import { Suspense } from 'react';
import { appConfig } from 'shared';
import { systemUploadPrefix } from 'shared/utils/upload-visibility';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { useDraftStore } from '~/modules/common/form-draft/draft-store';
import { Spinner } from '~/modules/common/spinner';
import { newsletterFormId } from '~/modules/system/create-newsletter-form';

export function NewsletterPreview() {
  // The write tab saves its draft when it unmounts, so the store holds what it last showed.
  const draft = useDraftStore((state) => state.getForm(newsletterFormId));
  const subject = typeof draft?.subject === 'string' ? draft.subject : '';
  const content = typeof draft?.content === 'string' ? draft.content : '';

  return (
    <section className="mt-5 rounded-lg border p-6 leading-normal">
      <h2 className="text-muted-foreground mb-4 text-lg font-semibold">{subject}</h2>

      <Suspense fallback={<Spinner className="my-16" noDelay />}>
        <BlockNoteFullHtml
          id={`${appConfig.name}-newsletter-preview-content`}
          defaultValue={content}
          className="text-muted-foreground"
          clickOpensPreview
          organizationId={systemUploadPrefix}
        />
      </Suspense>
    </section>
  );
}
