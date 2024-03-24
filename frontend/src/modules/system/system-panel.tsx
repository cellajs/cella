import { type Paddle, initializePaddle } from '@paddle/paddle-js';
import { Outlet } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageNav } from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { OrganizationsTableRoute, UsersTableRoute } from '~/router/routeTree';
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
      <SimpleHeader heading={t('common:system_panel')} text={t('common:system_panel.text')} />
      <Button variant="gradient" className="w-40 mx-4" onClick={() => openCheckout(config.paddlePriceIds.donate)}>
        Test checkout
      </Button>
      <PageNav
        tabs={[
          { id: 'users', label: 'user.plural', path: UsersTableRoute.fullPath },
          { id: 'organizations', label: 'organization.plural', path: OrganizationsTableRoute.fullPath },
        ]}
      />
      <div className="container mt-4 flex-[1_1_0]">
        <Outlet />
      </div>
    </>
  );
};

export default SystemPanel;
