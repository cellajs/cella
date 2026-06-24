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
      <p className="mb-12 font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">
        {t('about:call_to_action.intro')}
      </p>
      <p className="mb-12 text-xl leading-relaxed sm:text-3xl sm:leading-[2.8rem]">
        <span className="mr-2 opacity-50">“</span>
        <span>{t('about:call_to_action.start')}</span>
        <span className="ml-2 opacity-50">”</span>
        <span className="mr-2 ml-4 opacity-50">—</span>
        {t('about:call_to_action.finish')}
      </p>
      <div className="z-10 mx-auto mt-6 mb-12 flex flex-col gap-4 sm:flex-row">
        <Button
          variant="ghost"
          size="xl"
          onClick={() => window.open(appConfig.company.githubUrl, '_blank', 'noopener')}
          className="glow-button relative rounded-full! bg-background/95 px-10 hover:bg-background! active:bg-background"
          aria-label="Start building"
        >
          {t('c:start_building')}
        </Button>
        <Button
          ref={ref}
          variant="plain"
          size="xl"
          onClick={() => contactFormHandler(ref)}
          className="flex gap-1 rounded-full! px-10"
          aria-label="Talk to us"
        >
          {t('c:talk_to_us')}
        </Button>
      </div>
    </div>
  );
}
