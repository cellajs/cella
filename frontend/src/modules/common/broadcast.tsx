import { config } from 'config';
import type React from 'react';
import { createContext, useContext, useEffect } from 'react';
import { queryClient } from '~/lib/router';
import { menuKeys } from '../users/query';

// Define your preassigned functions
const actionHandlers = {
  refetchMenu: () => queryClient.invalidateQueries({ queryKey: menuKeys.all }),
};

type BroadcastActions = keyof typeof actionHandlers;

interface BroadcastContextValue {
  triggerAction: (action: BroadcastActions) => void;
}

const BroadcastChannelContext = createContext<BroadcastContextValue>({
  triggerAction: () => {},
});

const BroadcastChannelProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const channel = new BroadcastChannel(`${config.name}-broadcast`);

  useEffect(() => {
    const handleMessage = (event: MessageEvent<{ action: BroadcastActions }>) => {
      const { action } = event.data;

      if (actionHandlers[action]) actionHandlers[action]();
    };

    channel.onmessage = handleMessage;

    return () => channel.close();
  }, [channel]);

  const triggerAction = (action: BroadcastActions) => channel.postMessage({ action });

  return <BroadcastChannelContext.Provider value={{ triggerAction }}>{children}</BroadcastChannelContext.Provider>;
};

const useBroadcastChannel = () => {
  const context = useContext(BroadcastChannelContext);
  if (!context) throw new Error('useBroadcastChannel must be used within a BroadcastChannelProvider');

  return context;
};

export { BroadcastChannelProvider, useBroadcastChannel };
