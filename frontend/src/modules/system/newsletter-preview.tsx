import { appConfig } from 'config';
import { lazy, Suspense } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import Spinner from '~/modules/common/spinner';

const BlockNote = lazy(() => import('~/modules/common/blocknote'));

function NewsletterPreview() {
  const form = useFormWithDraft('create-newsletter');

  return (
    <div className="max-w-full mt-5 leading-normal flex flex-col items-center">
      <section className="rounded-lgborder p-6 w-full">
        <h2 className="text-muted-foreground font-semibold mb-4 text-lg">{form.getValues('subject')}</h2>

        <Suspense fallback={<Spinner className="my-16 h-6 w-6 opacity-50" noDelay />}>
          <BlockNote
            id={`${appConfig.name}-newsletter-preview-content`}
            type="preview"
            defaultValue={form.getValues('content')}
            className="text-muted-foreground font-light"
            clickOpensPreview
          />
        </Suspense>
      </section>
    </div>
  );
}
export default NewsletterPreview;
