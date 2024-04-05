import { useContext, useEffect } from 'react';
import { SSEContext } from './provider';

export function useSSE(eventName: string, listener: (this: EventSource, event: MessageEvent) => unknown): void {
  const source = useContext(SSEContext);

  useEffect(() => {
    if (!source) return;

    source.addEventListener(eventName, listener);

    return () => {
      source.removeEventListener(eventName, listener);
    };
  }, [source]);
}
