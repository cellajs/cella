import { Suspense } from 'react';
import { appConfig } from 'shared';
import { BlockNoteFullHtml } from '~/modules/common/blocknote/lazy-full-html';
import { useFormWithDraft } from '~/modules/common/form-draft/use-draft-form';
import { Spinner } from '~/modules/common/spinner';

export function NewsletterPreview() {
  const form = useFormWithDraft('create-newsletter');

  return (
    <div className="mt-5 flex max-w-full flex-col items-center leading-normal">
      <section className="w-full rounded-lgborder p-6">
        <h2 className="mb-4 font-semibold text-lg text-muted-foreground">{form.getValues('subject')}</h2>

        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNoteFullHtml
            id={`${appConfig.name}-newsletter-preview-content`}
            defaultValue={form.getValues('content')}
            className="text-muted-foreground"
            clickOpensPreview
            publicFiles
          />
        </Suspense>
      </section>
    </div>
  );
}
