import { config } from 'config';
import { type FC, createContext, createElement, useEffect, useState } from 'react';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

export const SSEProvider: FC<Props> = ({ children }) => {
  const [source, setSource] = useState<EventSource | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Closes old source, creates new
  const reconnect = () => {
    if (source) source.close(); // Close old if it exists
    const newSource = createSource(true);
    setSource(newSource);
  };

  const createSource = (reconnectAttempt = false) => {
    const source = new EventSource(`${config.backendUrl}/sse`, {
      withCredentials: true,
    });

    source.onopen = async () => {
      if (reconnectAttempt) await Promise.all([getAndSetMe(), getAndSetMenu()]); // Refetch data some sse events might have been skipped
      setIsReconnecting(false);
    };

    source.onerror = () => {
      console.error('SSE connection error. Scheduling reconnection...');
      source.close();
      if (!isReconnecting) {
        setIsReconnecting(true);
        setTimeout(reconnect, 5000); // Retry reconnection after 5 seconds
      }
    };

    return source;
  };

  useEffect(() => {
    const eventSource = createSource();
    setSource(eventSource);
    return () => eventSource.close();
  }, []);

  // Effect to handle reconnecting when the tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Reconnect if the page becomes visible and the SSE connection is closed
      if (document.visibilityState !== 'visible') return;
      if (source?.readyState === EventSource.CLOSED) reconnect();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [source]);

  return createElement(SSEContext.Provider, { value: source }, children);
};
