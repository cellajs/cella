import { type FC, createContext, createElement, useState } from 'react';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren<{ endpoint: string }>;

export const SSEProvider: FC<Props> = ({ children, ...props }) => {
  const [source] = useState(
    new EventSource(props.endpoint, {
      withCredentials: true,
    }),
  );

  return createElement(
    SSEContext.Provider,
    {
      value: source,
    },
    children,
  );
};
