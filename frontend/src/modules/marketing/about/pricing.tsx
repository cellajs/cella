import { config } from 'config';
import { Check, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ContactForm from '~/modules/common/contact-form/contact-form';
import { dialog } from '~/modules/common/dialoger/state';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

const pricingPlans = [
  {
    title: 'common:about.pricing.title_1',
    price: '€1k',
    priceId: null,
    description: 'about.pricing.description_1',
    features: [
      'common:about.pricing.plan_1.feature_1',
      'common:about.pricing.plan_1.feature_2',
      'common:about.pricing.plan_1.feature_3',
      'common:about.pricing.plan_1.feature_4',
      'common:about.pricing.plan_1.feature_5',
      'common:about.pricing.plan_1.feature_6',
      'common:about.pricing.plan_1.feature_7',
    ],
    borderColor: '',
    popular: false,
  },
  {
    title: 'common:about.pricing.title_2',
    price: '-€2k',
    priceId: null,
    description: 'about.pricing.description_2',
    features: [
      'common:about.pricing.plan_2.feature_1',
      'common:about.pricing.plan_2.feature_2',
      'common:about.pricing.plan_2.feature_3',
      'common:about.pricing.plan_2.feature_4',
    ],
    borderColor: 'ring-4 ring-primary/5',
    popular: true,
  },
  {
    title: 'common:about.pricing.title_3',
    description: 'about.pricing.description_3',
    price: 'TBD',
    priceId: null,
    features: ['common:about.pricing.plan_3.feature_1', 'common:about.pricing.plan_3.feature_2', 'common:about.pricing.plan_3.feature_3'],
    borderColor: '',
    popular: false,
  },
];

const Pricing = () => {
  const isFlexLayout = pricingPlans.length < 3;
  const { t } = useTranslation();

  return (
    <div
      className={`mx-auto mt-8 max-w-[86rem] ${isFlexLayout ? 'flex flex-col justify-center md:flex-row' : 'grid grid-cols-1 md:grid-cols-3'} gap-8`}
    >
      {pricingPlans.map((plan) => (
        <div
          key={plan.title}
          className={`bg-card relative flex flex-col justify-between rounded-lg border p-6 ${plan.borderColor} ${
            isFlexLayout ? 'w-full md:w-1/2 lg:w-1/3' : 'w-full'
          }`}
        >
          {plan.popular && (
            <Badge className="absolute top-0 left-1/2 -translate-x-2/4 font-light -translate-y-2/4 py-1 px-4 text-center">🚀 Build & get paid!</Badge>
          )}
          <div className="mt-4">
            <h3 className="text-center text-2xl flex w-full justify-center font-bold">
              {t(plan.title)}
              {plan.popular && <Sparkles className="ml-1 w-5 text-primary" strokeWidth={config.theme.strokeWidth} />}
            </h3>
            <div className="text-center mt-4 text-gray-600 dark:text-gray-400">
              <span className="mr-1 text-3xl font-bold">{plan.price}</span>
              <span className="font-light">/ {t('common:label.year')}</span>
            </div>

            <div className="mt-4 text-center font-light text-muted-foreground">
              <span className="">{t(plan.description)}</span>
            </div>

            <ul className="mt-4 space-y-2">
              {plan.features.map((feature, index) => (
                <li key={`${plan.title}-${index}`} className="flex text-sm font-light items-center">
                  <Check className="mr-2 p-1 text-sm text-success" />
                  {t(feature)}
                </li>
              ))}
            </ul>
          </div>

          <Button
            variant={plan.popular ? 'gradient' : 'plain'}
            className="w-full mt-6"
            aria-label="Open contact form"
            onClick={() => {
              dialog(<ContactForm dialog />, {
                drawerOnMobile: false,
                className: 'sm:max-w-[64rem]',
                title: 'Contact us',
                description: 'We will get back to you as soon as possible!',
              });
            }}
          >
            Contact us
          </Button>
        </div>
      ))}
    </div>
  );
};

export default Pricing;
