import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Button } from '~/modules/ui/button';

const CallToAction = () => {
  const { t } = useTranslation();
  const ref = useRef(null);

  return (
    <div className="mx-auto grid max-w-4xl">
      <p className="text-center text-4xl leading-[3rem] mb-6">{t('about:call_to_action')}</p>
      <div className="z-10 mx-auto mt-6 mb-12">
        <Button
          ref={ref}
          variant="ghost"
          size="xl"
          onClick={() => contactFormHandler(ref)}
          className="glow-button bg-background/95 px-20 rounded-full! relative hover:bg-background! active:bg-background"
          aria-label="Contact"
        >
          {t('common:contact_us')}
        </Button>
      </div>
    </div>
  );
};

export default CallToAction;
