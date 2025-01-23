import { useEffect } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { updateSourcesFromDataUrl } from '~/modules/common/blocknote/helpers';

export const MessageDraft = () => {
  const form = useFormWithDraft('request-message');

  useEffect(() => {
    updateSourcesFromDataUrl('message-draft-content');
  }, [form.getValues('content'), form.getValues('subject')]);

  return (
    <div className="max-w-full mt-5 leading-[1.5] flex flex-col items-center">
      <section className="rounded-lg border p-6 w-full">
        <p className="text-muted-foreground font-light">{form.getValues('subject')}</p>
        <div
          id="message-draft-content"
          className="text-muted-foreground font-light"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: blackNote html
          dangerouslySetInnerHTML={{ __html: form.getValues('content') }}
        />
      </section>
    </div>
  );
};
