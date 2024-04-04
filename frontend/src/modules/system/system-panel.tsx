import { initializePaddle, type Paddle } from '@paddle/paddle-js';
import { useMatches } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageNav } from '~/modules/common/page-nav';
import { SimpleHeader } from '~/modules/common/simple-header';
import { OrganizationsTableRoute, UsersTableRoute } from '~/routes/system';
import { FocusViewContainer } from '../common/focus-view';
import { Button } from '../ui/button';
import { AnimatedOutlet } from '../common/animated-outlet';
import { AnimatePresence } from 'framer-motion';

const SystemPanel = () => {
  const { t } = useTranslation();

  // Animate outlet
  const matches = useMatches();
  const currentMatch = matches.length ? matches[matches.length - 1] : null;

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

      <FocusViewContainer className="container mt-4">
        <AnimatePresence mode="popLayout">
          <AnimatedOutlet key={currentMatch ? currentMatch.pathname : null} />
        </AnimatePresence>
      </FocusViewContainer>
    </>
  );
};

export default SystemPanel;
