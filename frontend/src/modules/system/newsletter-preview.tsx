import { useFormWithDraft } from '~/hooks/use-draft-form';
import { BlockNotePreview } from '~/modules/common/blocknote/preview';

const NewsletterPreview = () => {
  const form = useFormWithDraft('create-newsletter');

  return (
    <div className="max-w-full mt-5 leading-[1.5] flex flex-col items-center">
      <section className="rounded-lgborder p-6 w-full">
        <h2 className="text-muted-foreground font-semibold mb-4 text-lg">{form.getValues('subject')}</h2>
        <BlockNotePreview
          id="newsletter-preview-content"
          defaultValue={form.getValues('content')}
          className="text-muted-foreground font-light"
          altClickOpensPreview
        />
      </section>
    </div>
  );
};
export default NewsletterPreview;
