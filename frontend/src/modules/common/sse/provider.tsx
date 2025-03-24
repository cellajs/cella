import { config } from 'config';
import { type FC, createContext, createElement, useEffect, useState } from 'react';
import { useOnlineManager } from '~/hooks/use-online-manager';
import { getAndSetMe, getAndSetMenu } from '~/modules/me/helpers';

export const SSEContext = createContext<EventSource | null>(null);
export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

/**
 * Provider for the EventSource connection to the server.
 * Reconnects when the connection is lost but stops if unauthorized (401).
 */
export const SSEProvider: FC<Props> = ({ children }) => {
  const { isOnline } = useOnlineManager();
  const [source, setSource] = useState<EventSource | null>(null);

  const createSource = (reconnectAttempt = false) => {
    const source = new EventSource(`${config.backendUrl}/me/sse`, {
      withCredentials: true,
    });

    source.onopen = async () => {
      if (reconnectAttempt) {
        await Promise.all([getAndSetMe(), getAndSetMenu()]);
        console.info('SSE reconnect successful!');
      } else console.info('SSE stream connected.');
    };

    source.onerror = () => {
      console.error('SSE connection closed.');

      source.close();
    };

    return source;
  };

  useEffect(() => {
    if (isOnline) {
      const eventSource = createSource();
      setSource(eventSource);
      return () => eventSource?.close();
    }
    source?.close(); // Clean up when going offline
  }, [isOnline]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && source?.readyState === EventSource.CLOSED) {
        if (source) source.close(); // Close old connection if it exists
        const newSource = createSource(true);
        setSource(newSource);
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [source]);

  return createElement(SSEContext.Provider, { value: source }, children);
};
