import { config } from 'config';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFormWithDraft } from '~/hooks/use-draft-form';
import { updateSourcesFromDataUrl } from '~/modules/common/blocknote/helpers';
import CarouselDialog, { type Slides } from '~/modules/common/carousel-dialog';
import Logo from '~/modules/common/logo';
import { useUserStore } from '~/store/user';
import { i18n } from '#/lib/i18n';

const link = 'text-[#0366d6] text-xs leading-[1.13rem] cursor-pointer';

const NewsletterDraft = () => {
  const { t } = useTranslation();
  const {
    user: { language: lng },
  } = useUserStore();

  const [slides, setSlides] = useState<Slides[]>([]);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselSlide, setCarouselSlide] = useState(0);

  const openCarouselDialog = (slide: number) => {
    setCarouselOpen(true);
    setCarouselSlide(slide);
  };

  const form = useFormWithDraft('send-newsletter');

  useEffect(() => {
    const slides = updateSourcesFromDataUrl(openCarouselDialog) ?? [];
    setSlides(slides);
  }, [form.getValues('content'), form.getValues('subject')]);

  return (
    <>
      <CarouselDialog
        title={t('common:view_attachment_of', { name: t('common:newsletter') })}
        isOpen={carouselOpen}
        onOpenChange={setCarouselOpen}
        slides={slides}
        carouselSlide={carouselSlide}
      />
      <div className="p-4 max-w-full leading-[1.5] flex flex-col gap-4 items-center">
        <p className="text-muted-foreground text-3xl text-center">
          {i18n.t('backend:email.newsletter_title', { orgName: 'Organization Name', lng })}
        </p>
        <section className="rounded-lg my-6 border p-6">
          <p className="text-muted-foreground font-light">{form.getValues('subject')}</p>
          {/* biome-ignore lint/security/noDangerouslySetInnerHtml: blackNote html*/}
          <div className="text-muted-foreground font-light" dangerouslySetInnerHTML={{ __html: form.getValues('content') }} />
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
    </>
  );
};
export default NewsletterDraft;
