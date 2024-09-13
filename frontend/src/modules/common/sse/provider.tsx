import { type FC, createContext, createElement, useEffect, useState } from 'react';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import { createResource } from './helpers';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

export const SSEProvider: FC<Props> = ({ children }) => {
  const [source, setSource] = useState<EventSource | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Tries up to 3 times, then pauses for 1 minute if unsuccessful
  const handleReconnect = async () => {
    if (retryCount < 3) {
      reconnect();
      setRetryCount(retryCount + 1);
    } else {
      await new Promise((resolve) => setTimeout(resolve, 60000)); // 1m wait
      setRetryCount(0);
      reconnect(); // Retry after the pause
    }
  };

  // Closes old source, creates new
  const reconnect = async () => {
    if (source) source.close(); // Close old if it exists
    const newSource = createResource(handleReconnect);
    setSource(newSource);
    await Promise.all([getAndSetMe(), getAndSetMenu()]); // Refetch data some sse events might have been skipped
  };

  // Effect to handle reconnecting when the tab becomes visible again
  useEffect(() => {
    const handleVisibilityChange = async () => {
      // Reconnect if the page becomes visible and the SSE connection is closed
      if (document.visibilityState !== 'visible' || source?.readyState !== EventSource.CLOSED) return;
      await reconnect();
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => window.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [source]);

  useEffect(() => {
    const eventSource = createResource(handleReconnect);
    setSource(eventSource);
    return () => eventSource.close();
  }, []);

  return createElement(
    SSEContext.Provider,
    {
      value: source,
    },
    children,
  );
};
