import { type ReactNode, type RefObject, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

export const useRenderInSummary = (ref: RefObject<HTMLDivElement>, id: string, reactNode: ReactNode) => {
  useEffect(() => {
    if (document.getElementById(id)) return;
    const element = ref.current?.querySelectorAll('p')[0];
    if (!element) return;
    const buttons = document.createElement('div');
    buttons.id = id;
    buttons.className = 'inline-flex';
    element.appendChild(buttons);
    const root = createRoot(buttons);
    root.render(reactNode);
  }, [reactNode, id, ref.current]);
};
