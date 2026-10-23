import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Button } from '~/modules/ui/button';

export function CallToAction() {
  const { t } = useTranslation();

  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="mx-auto grid max-w-4xl text-center">
      <p className="mb-12 font-semibold text-3xl leading-tight sm:text-4xl lg:text-5xl">{t('about:call_to_action.intro')}</p>

      <div className="z-10 mx-auto mt-6 mb-12 flex flex-col gap-4 sm:flex-row">
        <Button
          variant="ghost"
          size="xl"
          render={<a href={appConfig.company.githubUrl} target="_blank" rel="noreferrer" />}
          className="glow-button relative rounded-full bg-background/95 px-10 hover:bg-background active:bg-background"
          press={false}
        >
          {t('c:start_building')}
        </Button>
        <Button ref={buttonRef} variant="plain" size="xl" onClick={() => contactFormHandler(buttonRef)} className="rounded-full px-10">
          {t('c:talk_to_us')}
        </Button>
      </div>
    </div>
  );
}
