import { useEffect } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { updateSourcesFromDataUrl } from '~/modules/common/blocknote/helpers';

const NewsletterPreview = () => {
  const form = useFormWithDraft('create-newsletter');

  useEffect(() => {
    updateSourcesFromDataUrl('newsletter-preview-content');
  }, [form.getValues('content'), form.getValues('subject')]);

  return (
    <div className="max-w-full mt-5 leading-[1.5] flex flex-col items-center">
      <section className="rounded-lgborder p-6 w-full">
        <h2 className="text-muted-foreground font-semibold mb-4 text-lg">{form.getValues('subject')}</h2>
        <div
          id="newsletter-preview-content"
          className="text-muted-foreground font-light"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: blackNote html
          dangerouslySetInnerHTML={{ __html: form.getValues('content') }}
        />
      </section>
    </div>
  );
};
export default NewsletterPreview;
