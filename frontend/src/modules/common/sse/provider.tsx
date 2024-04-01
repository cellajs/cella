import { config } from 'config';
import { type FC, createContext, createElement } from 'react';

export const SSEContext = createContext<EventSource | null>(null);

export const SSEConsumer = SSEContext.Consumer;

type Props = React.PropsWithChildren;

const source = new EventSource(`${config.backendUrl}/sse`, {
  withCredentials: true,
});

export const SSEProvider: FC<Props> = ({ children }) => {
  return createElement(
    SSEContext.Provider,
    {
      value: source,
    },
    children,
  );
};
