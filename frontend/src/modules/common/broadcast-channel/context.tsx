import { config } from 'config';
import { type FC, type PropsWithChildren, createContext, useContext, useEffect, useRef } from 'react';
import { queryClient } from '~/lib/router';
import { menuKeys } from '~/modules/users/query';

// Define available actions
const actionHandlers = {
  refetchMenu: () => queryClient.invalidateQueries({ queryKey: menuKeys.all, refetchType: 'all' }),
} as const;

type BroadcastActions = keyof typeof actionHandlers;

type BroadcastContextValue = { triggerAction: (action: BroadcastActions, triggerInSender?: boolean) => void };

const BroadcastChannelContext = createContext<BroadcastContextValue>({ triggerAction: () => {} });

const BroadcastChannelProvider: FC<PropsWithChildren> = ({ children }) => {
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    channelRef.current = new BroadcastChannel(`${config.name}-broadcast`);

    const handleMessage = (
      event: MessageEvent<{
        action: BroadcastActions;
      }>,
    ) => {
      console.debug('Received broadcast:', event.data);
      const { action } = event.data;
      actionHandlers[action]?.();
    };

    channelRef.current.addEventListener('message', handleMessage);

    return () => {
      channelRef.current?.removeEventListener('message', handleMessage);
      channelRef.current?.close();
      channelRef.current = null;
    };
  }, []);

  const triggerAction = (action: BroadcastActions, triggerInSender?: boolean) => {
    if (!channelRef.current) channelRef.current = new BroadcastChannel(`${config.name}-broadcast`);

    if (triggerInSender) actionHandlers[action]?.();
    console.debug('Sending broadcast:', action);
    channelRef.current.postMessage({ action });
  };

  return <BroadcastChannelContext.Provider value={{ triggerAction }}>{children}</BroadcastChannelContext.Provider>;
};

const useBroadcastChannel = (): BroadcastContextValue => {
  const context = useContext(BroadcastChannelContext);
  if (!context) throw new Error('useBroadcastChannel must be used within a BroadcastChannelProvider');

  return context;
};

export { BroadcastChannelProvider, useBroadcastChannel };
