import { useFormWithDraft } from '~/hooks/use-draft-form';
import { BlockNote } from '~/modules/common/blocknote';

const NewsletterPreview = () => {
  const form = useFormWithDraft('create-newsletter');

  return (
    <div className="max-w-full mt-5 leading-[1.5] flex flex-col items-center">
      <section className="rounded-lgborder p-6 w-full">
        <h2 className="text-muted-foreground font-semibold mb-4 text-lg">{form.getValues('subject')}</h2>
        <BlockNote
          id="newsletter-preview-content"
          type="preview"
          defaultValue={form.getValues('content')}
          className="text-muted-foreground font-light"
          clickOpensPreview
        />
      </section>
    </div>
  );
};
export default NewsletterPreview;
