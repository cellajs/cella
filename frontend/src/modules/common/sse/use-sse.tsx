import { useContext, useEffect } from 'react';
import { SSEContext } from '~/modules/common/sse/provider';

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
