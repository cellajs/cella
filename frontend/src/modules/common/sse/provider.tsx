import { config } from 'config';
import { type FC, createContext, createElement, useEffect, useState } from 'react';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

export const SSEProvider: FC<Props> = ({ children }) => {
  const [source, setSource] = useState<EventSource | null>(null);

  const createResource = () => {
    const eventSource = new EventSource(`${config.backendUrl}/sse`, {
      withCredentials: true,
    });

    eventSource.onerror = () => {
      // Handle the error and try to reconnect
      console.error('SSE connection error. Reconnecting...');
      eventSource.close();
      reconnect();
    };

    return eventSource;
  };
  const reconnect = async () => {
    if (source) source.close(); // Delete old source if it exists
    const newSource = createResource();
    setSource(newSource);
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
  };

  useEffect(() => {
    const eventSource = createResource();
    setSource(eventSource);

    const handleVisibilityChange = async () => document.visibilityState === 'visible' && reconnect();

    window.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      eventSource.close();
      window.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return createElement(
    SSEContext.Provider,
    {
      value: source,
    },
    children,
  );
};
