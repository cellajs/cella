import { Link } from '@tanstack/react-router';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { AboutStatement } from '~/modules/marketing/about/section';
import { TryDemoButton } from '~/modules/marketing/about/try-demo-button';
import { Button } from '~/modules/ui/button';

export function CallToAction() {
  const { t } = useTranslation();

  const buttonRef = useRef<HTMLButtonElement>(null);

  return (
    <div className="mx-auto grid max-w-4xl text-center">
      <AboutStatement text="about:call_to_action.intro" className="mb-6" />

      <div className="z-10 mx-auto mt-6 mb-12 flex flex-col gap-4 sm:flex-row">
        {appConfig.has.demos && <TryDemoButton className="rounded-full px-10" />}
        <Button
          variant="ghost"
          size="xl"
          render={<Link to="/docs" />}
          // The glow sits behind the button: an opaque fill and no border keep it a 1px ring outside
          className="glow-button bg-background/95 hover:bg-background active:bg-background dark:hover:bg-background relative rounded-full border-0 px-10"
          press={false}
        >
          {t('c:view_docs')}
        </Button>
        <Button ref={buttonRef} variant="secondary" size="xl" onClick={() => contactFormHandler(buttonRef)} className="rounded-full px-10">
          {t('c:talk_to_us')}
        </Button>
      </div>
    </div>
  );
}
