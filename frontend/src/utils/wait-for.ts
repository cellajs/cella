export const waitFor = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Resolves at once in a visible tab, else when the tab is next shown. */
export const whenVisible = (): Promise<void> =>
  typeof document === 'undefined' || !document.hidden
    ? Promise.resolve()
    : new Promise((resolve) => {
        const onChange = () => {
          if (document.hidden) return;
          document.removeEventListener('visibilitychange', onChange);
          resolve();
        };
        document.addEventListener('visibilitychange', onChange);
      });
