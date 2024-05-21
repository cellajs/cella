import { type Paddle, initializePaddle } from '@paddle/paddle-js';
import { Outlet } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageNav } from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { OrganizationsTableRoute, RequestsTableRoute, UsersTableRoute } from '~/routes/system';
import { FocusViewContainer } from '../common/focus-view';
import { Button } from '../ui/button';

const SystemPanel = () => {
  const { t } = useTranslation();

  // Create a local state to store Paddle instance
  const [paddle, setPaddle] = useState<Paddle>();

  // Callback to open a checkout
  const openCheckout = (priceId: string) => {
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
      <SimpleHeader heading={t('common:system_panel')} text={t('common:system_panel.text')} className="container pt-4 md:pt-6">
        <Button variant="gradient" className="w-40" onClick={() => openCheckout(config.paddlePriceIds.donate)}>
          WIP checkout
        </Button>
      </SimpleHeader>

      <PageNav
        tabs={[
          { id: 'users', label: 'users', path: UsersTableRoute.fullPath },
          { id: 'organizations', label: 'organizations', path: OrganizationsTableRoute.fullPath },
          { id: 'requests', label: 'requests', path: RequestsTableRoute.fullPath },
        ]}
      />

      <FocusViewContainer className="container mt-4">
        <Outlet />
      </FocusViewContainer>
    </>
  );
};

export default SystemPanel;
