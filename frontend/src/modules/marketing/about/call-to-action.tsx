import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Button } from '~/modules/ui/button';

export function CallToAction() {
  const { t } = useTranslation();

  const ref = useRef(null);

  return (
    <div className="mx-auto grid max-w-4xl text-center">
      <p className="mb-12 font-semibold text-4xl leading-16 sm:text-5xl lg:text-6xl">
        {t('about:call_to_action.intro')}
      </p>
      <p className="mb-12 text-2xl leading-[3.3rem] sm:text-4xl">
        <span className="mr-2 opacity-50">“</span>
        <span>{t('about:call_to_action.start')}</span>
        <span className="ml-2 opacity-50">”</span>
        <span className="mr-2 ml-4 opacity-50">—</span>
        {t('about:call_to_action.finish')}
      </p>
      <div className="z-10 mx-auto mt-6 mb-12 flex flex-col gap-4 sm:flex-row">
        <Button
          ref={ref}
          variant="ghost"
          size="xl"
          onClick={() => contactFormHandler(ref)}
          className="glow-button relative rounded-full! bg-background/95 px-10 hover:bg-background! active:bg-background"
          aria-label="Contact"
        >
          {t('c:contact_us')}
        </Button>
        <Button
          variant="plain"
          size="xl"
          onClick={() => window.open(appConfig.company.element, '_blank', 'noopener')}
          className="flex gap-1 rounded-full! px-10"
          aria-label="Contact"
        >
          {t('c:chat_with_us')}
        </Button>
      </div>
    </div>
  );
}
