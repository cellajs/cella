import { useContext, useEffect } from 'react';
import { SSEContext } from './provider';

export function useSSE(eventName: string, listener: (this: EventSource, event: MessageEvent) => unknown): void {
  const source = useContext(SSEContext);

  if (!source) {
    throw new Error('Could not find an SSE context; You have to wrap useSSE() in a <SSEProvider>.');
  }

  useEffect(() => {
    source.addEventListener(eventName, listener);

    return () => {
      source.removeEventListener(eventName, listener);
    };
  }, []);
}
