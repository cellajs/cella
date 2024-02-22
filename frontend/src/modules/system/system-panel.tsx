import { Outlet } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import PageNav from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { Paddle, initializePaddle } from '@paddle/paddle-js';
import { config } from 'config';
import { Button } from '../ui/button';

const systemTabs = [
  {
    name: 'Users',
    path: '/system',
  },
  {
    name: 'Organizations',
    path: '/system/organizations',
  },
];

const SystemPanel = () => {
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
    initializePaddle({ environment: config.mode === 'development' ? 'sandbox' : 'production', token: config.paddleToken }).then(
      (paddleInstance: Paddle | undefined) => {
        if (paddleInstance) {
          setPaddle(paddleInstance);
        }
      },
    );
  }, []);

  return (
    <>
      <SimpleHeader heading="System" text="System admins can manage and monitor all organizations and their members." />
      <Button variant="gradient" className="w-40 mx-4" aria-label="Donate" onClick={() => openCheckout(config.paddlePriceIds.donate)}>
        Donate
      </Button>
      <PageNav tabs={systemTabs} />
      <div className="container mt-4 flex-[1_1_0]">
        <Outlet />
      </div>
    </>
  );
};

export default SystemPanel;
