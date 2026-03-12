import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { onlineManager } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { Tenant } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

export function Subscription({ tenant }: { tenant: Tenant }) {
  const { t } = useTranslation();

  // WIP: Continue here later
  console.info('tenant billing', tenant);

  // Create a local state to store Paddle instance
  const [paddle, setPaddle] = useState<Paddle>();

  // Callback to open a checkout
  const openCheckout = (priceId: string) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
      customData: { tenantId: tenant.id },
    });
  };

  // Download and initialize Paddle instance from CDN
  useEffect(() => {
    initializePaddle({
      // environment: appConfig.mode === 'production' ? 'production' : 'sandbox',
      environment: 'sandbox',
      token: appConfig.paddleToken,
    }).then((paddleInstance: Paddle | undefined) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });
  }, []);

  return (
    <>
      <Button
        variant="plain"
        className="max-sm:w-full w-40"
        onClick={() => openCheckout(appConfig.paddlePriceIds.donate)}
      >
        {t('common:checkout')}
      </Button>
    </>
  );
}
