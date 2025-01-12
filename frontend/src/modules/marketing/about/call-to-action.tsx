import { useTranslation } from 'react-i18next';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Button } from '~/modules/ui/button';

const CallToAction = () => {
  const { t } = useTranslation();

  const handleContactUs = () => {
    dialog(<ContactForm dialog />, {
      id: 'contact-form',
      drawerOnMobile: false,
      className: 'sm:max-w-5xl',
      title: t('common:contact_us'),
      description: t('common:contact_us.text'),
    });
  };

  return (
    <div className="mx-auto grid max-w-4xl">
      <p className="text-center text-3xl leading-10 mb-6">{t('about:call_to_action')}</p>
      <div className="z-10 mx-auto mt-6 mb-12">
        <Button
          variant="ghost"
          size="xl"
          onClick={handleContactUs}
          className="glow-button bg-background/95 px-20 !rounded-full relative hover:!bg-background active:bg-background"
          aria-label="Contact"
        >
          {t('common:contact_us')}
        </Button>
      </div>
    </div>
  );
};

export default CallToAction;
