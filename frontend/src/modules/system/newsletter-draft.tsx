import { config } from 'config';

import { useEffect } from 'react';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { updateSourcesFromDataUrl } from '~/modules/common/blocknote/helpers';
import Logo from '~/modules/common/logo';
import { useUserStore } from '~/store/user';
import { i18n } from '#/lib/i18n';

const link = 'text-[#0366d6] text-xs leading-[1.13rem] cursor-pointer';

const NewsletterDraft = () => {
  const {
    user: { language: lng },
  } = useUserStore();

  const form = useFormWithDraft('send-newsletter');

  useEffect(() => {
    updateSourcesFromDataUrl('newsletter-draft-content');
  }, [form.getValues('content'), form.getValues('subject')]);

  return (
    <div className="p-4 max-w-full leading-[1.5] flex flex-col gap-4 items-center">
      <p className="text-muted-foreground text-3xl text-center">{i18n.t('backend:email.newsletter_title', { orgName: 'Organization Name', lng })}</p>
      <section className="rounded-lg my-6 border p-6 w-full">
        <p className="text-muted-foreground font-light">{form.getValues('subject')}</p>
        <div
          id="newsletter-draft-content"
          className="text-muted-foreground font-light"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: blackNote html
          dangerouslySetInnerHTML={{ __html: form.getValues('content') }}
        />
        <span className={link}>{i18n.t('backend:email.unsubscribe', { lng })}</span>
      </section>

      <Logo />
      <span className="mt-5 flex justify-center gap-1 text-center">
        <span className={link}>{i18n.t('backend:email.author_email')}</span>・<span className={link}>{i18n.t('backend:email.support_email')}</span>
      </span>

      <footer className="text-[#6a737d] text-xs text-center mt-11">
        {config.name}・{config.company.streetAddress}・{config.company.city}・{config.company.country}, {config.company.postcode}
      </footer>
    </div>
  );
};
export default NewsletterDraft;
