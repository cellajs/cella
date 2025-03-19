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
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [lastErrorTime, setLastErrorTime] = useState<Date | null>(null);
  const [hasAuthError, setHasAuthError] = useState(false); // Prevents reconnect loops

  // Closes old source, creates new
  const reconnect = () => {
    if (hasAuthError) return; // Stop if authentication failed
    if (source) source.close(); // Close old connection if it exists
    const newSource = createSource(true);
    setSource(newSource);
  };

  const createSource = (reconnectAttempt = false) => {
    if (hasAuthError) return null; // Prevent creating SSE if unauthorized

    const source = new EventSource(`${config.backendUrl}/me/sse`, {
      withCredentials: true,
    });

    source.onopen = async () => {
      if (reconnectAttempt) {
        await Promise.all([getAndSetMe(), getAndSetMenu()]);
        console.info('SSE reconnection successful!');
      }
      setIsReconnecting(false);
    };

    source.onerror = () => {
      console.error('SSE connection error. Checking if it should stop reconnecting...');
      const now = new Date();
      setLastErrorTime(now);

      if (lastErrorTime && now.getTime() - lastErrorTime.getTime() < 2000) {
        console.error('SSE failed quickly after reconnecting. Assuming 401 Unauthorized. Stopping retries.');
        setHasAuthError(true);
      } else if (!isReconnecting && isOnline) {
        console.error('Scheduling SSE reconnection ...');
        setIsReconnecting(true);
        setTimeout(reconnect, 5000);
      }

      source.close();
    };

    return source;
  };

  useEffect(() => {
    if (isOnline && !hasAuthError) {
      const eventSource = createSource();
      setSource(eventSource);
      return () => eventSource?.close();
    }
    source?.close(); // Clean up when going offline
  }, [isOnline, hasAuthError]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && source?.readyState === EventSource.CLOSED && !hasAuthError) {
        reconnect();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [source, hasAuthError]);

  return createElement(SSEContext.Provider, { value: source }, children);
};
