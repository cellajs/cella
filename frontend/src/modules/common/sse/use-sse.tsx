import { createContext, useContext, useEffect } from 'react';

export const SSEContext = createContext<EventSource | null>(null);

export const useSSE = (eventName: string, listener: (this: EventSource, event: MessageEvent) => unknown) => {
  const source = useContext(SSEContext);

  useEffect(() => {
    if (!source) return;
    source.addEventListener(eventName, listener);

    return () => {
      source.removeEventListener(eventName, listener);
    };
  }, [source]);
};
