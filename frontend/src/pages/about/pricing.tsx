import config from 'config';
import { Check, Sparkles } from 'lucide-react';
import ContactForm from '~/components/contact-form/contact-form';
import { dialog } from '~/components/dialoger/state';
import { Badge } from '~/components/ui/badge';
import { Button } from '~/components/ui/button';

const pricingPlans = [
  {
    title: 'Donate',
    price: '€1k',
    description: '50% to sponsor OS libraries and 50% to a Cella bounty program.',
    features: [
      'Member of CellaJS community',
      'Apply for €100k+ Cella Fund',
      'Access to private repos',
      'Collective buying power',
      'Create bounty projects',
      'Vote on bounty projects',
      'Contribute to Cella roadmap',
    ],
    borderColor: '',
    popular: false,
  },
  {
    title: 'Build',
    price: '-€2k',
    description: "Earn while building your own product. Open source or 'community source' parts of your code.",
    features: ['... Everything from Donate', 'Realize bounty projects', 'Bigger voice in roadmap', 'Showcase your work'],
    borderColor: 'ring-4 ring-primary/5',
    popular: true,
  },
  {
    title: 'Partner',
    description: 'Do you have a product that integrates well with CellaJS? Become a partner.',
    price: 'TBD',
    features: ['Partner showcase page', 'Improve the TypeScript ecoystem', 'Scale with other European partners'],
    borderColor: '',
    popular: false,
  },
];

const Pricing = () => {
  const isFlexLayout = pricingPlans.length < 3;

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
              {plan.title}
              {plan.popular && <Sparkles className="ml-1 w-5 text-primary" strokeWidth={config.theme.strokeWidth} />}
            </h3>
            <div className="text-center mt-4 text-gray-600 dark:text-gray-400">
              <span className="mr-1 text-3xl font-bold">{plan.price}</span>
              <span className="font-light">/ year</span>
            </div>

            <div className="mt-4 text-center font-light text-muted-foreground">
              <span className="">{plan.description}</span>
            </div>

            <ul className="mt-4 space-y-2">
              {plan.features.map((feature, index) => (
                <li key={`plan-feature-${index}`} className="flex text-sm font-light items-center">
                  <Check className="mr-2 p-1 text-sm text-success" />
                  {feature}
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
