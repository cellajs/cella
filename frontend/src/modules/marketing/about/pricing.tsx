import { useNavigate } from '@tanstack/react-router';
import { CheckIcon, SparklesIcon } from 'lucide-react';
import { createRef, type RefObject, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { contactFormHandler } from '~/modules/common/contact-form/contact-form-handler';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { pricingPlans } from '~/modules/marketing/marketing-config';
import { WaitlistForm } from '~/modules/requests/waitlist-form';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

export interface PricingPlan {
  id: string;
  action: 'sign_in' | 'contact_us' | 'waitlist_request';
  priceId: string | null;
  featureCount: number;
  borderColor: string;
  popular?: boolean;
  discount?: string;
}

const isFlexLayout = pricingPlans.length < 3;

export function Pricing() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const buttonRefs = useRef<Array<RefObject<HTMLButtonElement | null>>>(pricingPlans.map(() => createRef()));

  const handleActionClick = (
    action: 'sign_in' | 'contact_us' | 'waitlist_request',
    buttonRef: RefObject<HTMLButtonElement | null>,
  ) => {
    if (action === 'contact_us') return contactFormHandler(buttonRef);

    if (action === 'sign_in') {
      navigate({ to: '/auth/authenticate', replace: true });
    }
    if (action === 'waitlist_request') {
      useDialoger.getState().create(<WaitlistForm dialog />, {
        id: 'waitlist-form',
        triggerRef: buttonRef,
        drawerOnMobile: true,
        className: 'sm:max-w-2xl',
        title: t('c:waitlist_request'),
        description: t('c:waitlist_request.text', { appName: appConfig.name }),
      });
    }
  };

  return (
    <div
      className={`mx-auto mt-8 max-w-7xl ${isFlexLayout ? 'flex flex-col justify-center md:flex-row' : 'grid grid-cols-1 md:grid-cols-3'} gap-8`}
    >
      {pricingPlans.map(({ id, borderColor, featureCount, popular, discount, action }, planIndex) => {
        const title = `about:pricing.title_${planIndex + 1}`;
        const text = `about:pricing.text_${planIndex + 1}`;
        const price = `about:pricing.plan_${planIndex + 1}.title`;

        const ref = buttonRefs.current[planIndex];

        return (
          <div
            key={id}
            className={`relative flex flex-col justify-between rounded-lg border bg-card p-6 ${borderColor} ${
              isFlexLayout ? 'w-full md:w-1/2 lg:w-1/3' : 'w-full'
            }`}
          >
            {popular && (
              <Badge
                size="sm"
                className="absolute top-0 left-1/2 -translate-x-2/4 -translate-y-2/4 px-4 py-1 text-center"
              >
                🚀 {t('about:pricing.popular')}
              </Badge>
            )}
            <div className="mt-4">
              <h3 className="flex w-full justify-center text-center font-bold text-2xl">
                {t(title)}
                {popular && (
                  <SparklesIcon className="ml-1 w-5 text-primary" strokeWidth={appConfig.theme.strokeWidth} />
                )}
              </h3>
              <div className="mt-4 flex items-center justify-center text-gray-600 dark:text-gray-400">
                {discount && (
                  <Badge size="md" className="mr-2 px-2 py-0 text-lg">
                    {discount}
                  </Badge>
                )}
                <span className={`font-bold text-3xl ${discount ? 'mr-2 line-through' : 'mr-1'}`}>{t(price)}</span>
                <span>/ {t('c:year')}</span>
              </div>

              <div className="mt-4 text-center text-muted-foreground">
                <span className="">{t(text)}</span>
              </div>

              <ul className="mt-4 space-y-2">
                {Array.from({ length: featureCount }).map((_, featureIndex) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: list is static and will not be reordered
                  <li key={`${id}-${featureIndex}`} className="flex items-center text-sm">
                    <CheckIcon className="mr-2 p-1 text-sm text-success" />
                    {t(`about:pricing.plan_${planIndex + 1}.${featureIndex + 1}`)}
                  </li>
                ))}
              </ul>
            </div>

            <Button
              ref={ref}
              variant={popular ? 'default' : 'plain'}
              className="mt-6 w-full"
              aria-label={`Handle the ${t(`c:${action}`)} click`}
              onClick={() => handleActionClick(action, ref)}
            >
              {t(`c:${action}`)}
            </Button>
          </div>
        );
      })}
    </div>
  );
}
