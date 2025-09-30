import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { Button } from '~/modules/ui/button';

const CallToAction = () => {
  const { t } = useTranslation();
  const ref = useRef(null);

  return (
    <div className="mx-auto grid max-w-4xl text-center">
      <p className="font-semibold text-4xl sm:text-6xl lg:text-7xl leading-[4rem] mb-12">{t('about:call_to_action.intro')}</p>
      <p className="text-2xl sm:text-4xl leading-[3.3rem] mb-12">
        <span className="opacity-50 mr-2">“</span>
        <span className="font-light">{t('about:call_to_action.start')}</span>
        <span className="opacity-50 ml-2">”</span>
        <span className="opacity-50 ml-4 mr-2">—</span>
        {t('about:call_to_action.finish')}
      </p>
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
