import { config } from 'config';
import { type FC, createContext, createElement, useState, useEffect } from 'react';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

export const SSEProvider: FC<Props> = ({ children }) => {
  const [source, setSource] = useState<EventSource | null>(null);

  useEffect(() => {
    const eventSource = new EventSource(`${config.backendUrl}/sse`, {
      withCredentials: true,
    });

    setSource(eventSource);

    return () => {
      eventSource.close();
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
