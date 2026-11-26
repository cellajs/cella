import { create } from 'zustand';

/** The boundary a debug crash reaches, as a user's crash does: the content's, or the root one of the app layout. */
type CrashSite = 'content' | 'layout';

const useCrashStore = create<{ site: CrashSite | null }>(() => ({ site: null }));

/** Makes the `DebugCrash` at `site` throw at its next render, once. */
export const crashAt = (site: CrashSite) => {
  useCrashStore.setState({ site });
  setTimeout(() => useCrashStore.setState({ site: null }));
};

/** Throws while rendering when the debug menu asked for a crash at its site. */
export function DebugCrash({ site }: { site: CrashSite }) {
  const armed = useCrashStore((state) => state.site === site);
  if (armed) throw new Error(`Debug crash under the ${site} boundary`);
  return null;
}
