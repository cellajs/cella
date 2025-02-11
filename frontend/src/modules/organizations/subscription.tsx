import { type Paddle, initializePaddle } from '@paddle/paddle-js';
import { onlineManager } from '@tanstack/react-query';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toaster } from '~/modules/common/toaster';
import type { Organization } from '~/modules/organizations/types';
import { Button } from '~/modules/ui/button';

const Subscription = ({ organization }: { organization: Organization }) => {
  const { t } = useTranslation();

  // WIP: Continue here later
  console.info('org billing', organization);

  // Create a local state to store Paddle instance
  const [paddle, setPaddle] = useState<Paddle>();

  // Callback to open a checkout
  const openCheckout = (priceId: string) => {
    if (!onlineManager.isOnline()) return toaster(t('common:action.offline.text'), 'warning');

    paddle?.Checkout.open({
      items: [{ priceId, quantity: 1 }],
    });
  };

  // Download and initialize Paddle instance from CDN
  useEffect(() => {
    initializePaddle({
      // environment: config.mode === 'development' ? 'sandbox' : 'production',
      environment: 'sandbox',
      token: config.paddleToken,
    }).then((paddleInstance: Paddle | undefined) => {
      if (paddleInstance) {
        setPaddle(paddleInstance);
      }
    });
  }, []);

  return (
    <>
      <Button variant="plain" className="max-sm:w-full w-40" onClick={() => openCheckout(config.paddlePriceIds.donate)}>
        {t('common:checkout')}
      </Button>
    </>
  );
};

export default Subscription;
