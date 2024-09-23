import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { dialog } from '~/modules/common/dialoger/state';
import { WaitListForm } from '~/modules/common/wait-list-form';
import { pricingPlans } from '~/modules/marketing/about-config';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

const Pricing = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isFlexLayout = pricingPlans.length < 3;

  const handleActionClick = (action: 'sign_in' | 'contact_us' | 'waitlist_request') => {
    if (action === 'contact_us') {
      dialog(<ContactForm dialog />, {
        id: 'contact-form',
        drawerOnMobile: false,
        className: 'sm:max-w-5xl',
        title: t('common:contact_us'),
        text: t('common:contact_us.text'),
      });
    }
    if (action === 'sign_in') {
      navigate({ to: '/auth/sign-in', replace: true });
    }
    if (action === 'waitlist_request') {
      dialog(<WaitListForm email="" dialog emailField />, {
        id: 'waitlist-form',
        drawerOnMobile: true,
        className: 'sm:max-w-2xl',
        title: t('common:waitlist_request'),
        text: t('common:waitlist_request.text', { appName: config.name }),
      });
    }
  };

  return (
    <div className={`mx-auto mt-8 max-w-7xl ${isFlexLayout ? 'flex flex-col justify-center md:flex-row' : 'grid grid-cols-1 md:grid-cols-3'} gap-8`}>
      {pricingPlans.map(({ id, borderColor, featureCount, popular, discount, action }, planIndex) => {
        const title = `about:pricing.title_${planIndex + 1}`;
        const text = `about:pricing.text_${planIndex + 1}`;
        const price = `about:pricing.plan_${planIndex + 1}.title`;

        return (
          <div
            key={id}
            className={`bg-card relative flex flex-col justify-between rounded-lg border p-6 ${borderColor} ${
              isFlexLayout ? 'w-full md:w-1/2 lg:w-1/3' : 'w-full'
            }`}
          >
            {popular && (
              <Badge className="absolute top-0 left-1/2 -translate-x-2/4 font-light -translate-y-2/4 py-1 px-4 text-center">
                🚀 {t('about:pricing.popular')}
              </Badge>
            )}
            <div className="mt-4">
              <h3 className="text-center text-2xl flex w-full justify-center font-bold">
                {t(title)}
                {popular && <Sparkles className="ml-1 w-5 text-primary" strokeWidth={config.theme.strokeWidth} />}
              </h3>
              <div className="flex items-center justify-center mt-4 text-gray-600 dark:text-gray-400">
                {discount && <Badge className="text-lg mr-2 py-0 px-2">{discount}</Badge>}
                <span className={`text-3xl font-bold ${discount ? 'line-through mr-2' : 'mr-1'}`}>{t(price)}</span>
                <span className="font-light">/ {t('common:year')}</span>
              </div>

              <div className="mt-4 text-center font-light text-muted-foreground">
                <span className="">{t(text)}</span>
              </div>

              <ul className="mt-4 space-y-2">
                {Array.from({ length: featureCount }).map((_, featureIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: <explanation>
                  <li key={`${id}-${featureIndex}`} className="flex text-sm font-light items-center">
                    <Check className="mr-2 p-1 text-sm text-success" />
                    {t(`about:pricing.plan_${planIndex + 1}.${featureIndex + 1}`)}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              variant={popular ? 'default' : 'plain'}
              className="w-full mt-6"
              aria-label={`Handle the ${t(`common:${action}`)} click`}
              onClick={() => handleActionClick(action)}
            >
              {t(`common:${action}`)}
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default Pricing;
