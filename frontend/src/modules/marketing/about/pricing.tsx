import { config } from 'config';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

interface PricingPlan {
  id: string;
  price: string;
  priceId: string | null;
  featureCount: number;
  borderColor: string;
  popular?: boolean;
}

const pricingPlans: PricingPlan[] = [
  { id: 'donate', price: 'pay €1k', priceId: null, featureCount: 7, borderColor: '' },
  { id: 'build', price: 'receive €1-12k', priceId: null, featureCount: 4, borderColor: 'ring-4 ring-primary/5', popular: true },
  { id: 'partner', price: 'To be decided', priceId: null, featureCount: 3, borderColor: '' },
];

const Pricing = () => {
  const isFlexLayout = pricingPlans.length < 3;
  const { t } = useTranslation();

  const openContactForm = () => {
    dialog(<ContactForm dialog />, {
      drawerOnMobile: false,
      className: 'sm:max-w-[64rem]',
      title: 'Contact us',
      text: 'We will get back to you as soon as possible!',
    });
  };

  return (
    <div
      className={`mx-auto mt-8 max-w-[86rem] ${isFlexLayout ? 'flex flex-col justify-center md:flex-row' : 'grid grid-cols-1 md:grid-cols-3'} gap-8`}
    >
      {pricingPlans.map(({ id, borderColor, featureCount, popular, price }, planIndex) => {
        const title = `about:pricing.title_${planIndex + 1}`;
        const text = `about:pricing.text_${planIndex + 1}`;

        return (
          <div
            key={id}
            className={`bg-card relative flex flex-col justify-between rounded-lg border p-6 ${borderColor} ${
              isFlexLayout ? 'w-full md:w-1/2 lg:w-1/3' : 'w-full'
            }`}
          >
            {popular && (
              <Badge className="absolute top-0 left-1/2 -translate-x-2/4 font-light -translate-y-2/4 py-1 px-4 text-center">
                🚀 Build & get paid!
              </Badge>
            )}
            <div className="mt-4">
              <h3 className="text-center text-2xl flex w-full justify-center font-bold">
                {t(title)}
                {popular && <Sparkles className="ml-1 w-5 text-primary" strokeWidth={config.theme.strokeWidth} />}
              </h3>
              <div className="text-center mt-4 text-gray-600 dark:text-gray-400">
                <span className="mr-1 text-3xl font-bold">{price}</span>
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

            <Button variant={popular ? 'gradient' : 'plain'} className="w-full mt-6" aria-label="Open contact form" onClick={openContactForm}>
              Contact us
            </Button>
          </div>
        );
      })}
    </div>
  );
};

export default Pricing;
