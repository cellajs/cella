import { useEffect } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { updateSourcesFromDataUrl } from '~/modules/common/blocknote/helpers';

const OrganizationsNewsletterDraft = () => {
  const form = useFormWithDraft('send-org-newsletter');

  useEffect(() => {
    updateSourcesFromDataUrl('org-newsletter-draft-content');
  }, [form.getValues('content'), form.getValues('subject')]);

  return (
    <div className="p-4 max-w-full leading-[1.5] flex flex-col gap-4 items-center">
      <section className="rounded-lg my-6 border p-6 w-full">
        <p className="text-muted-foreground font-light">{form.getValues('subject')}</p>
        <div
          id="org-newsletter-draft-content"
          className="text-muted-foreground font-light"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: blackNote html
          dangerouslySetInnerHTML={{ __html: form.getValues('content') }}
        />
      </section>
    </div>
  );
};
export default OrganizationsNewsletterDraft;
