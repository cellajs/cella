import { useRouter, useSearch } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { appConfig } from 'shared';
import { endSession } from '~/modules/auth/end-session';
import type { UnsavedEdit } from '~/modules/auth/unsaved-edits-dialog';
import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { teardownUserState } from '~/utils/teardown-user-state';

// Loaded on demand: the list reaches the Yjs connections and the editor chunk, which the auth pages never need.
const UnsavedEditsGate = lazy(() => import('~/modules/auth/unsaved-edits-dialog').then((module) => ({ default: module.UnsavedEditsGate })));

/**
 * Signs out, after asking while some edits no server holds would go with the session: the dialog lists them live, and
 * sign-out continues by itself once they all saved. `force` (the account is gone) skips the question: nothing can save.
 */
export function SignOut() {
  const router = useRouter();

  const { force } = useSearch({ from: '/_public/auth/sign-out' });

  // Edits still queued for the store are written first, so the list holds them.
  const [flushed, setFlushed] = useState(!!force);
  useEffect(() => {
    if (force) return;
    flushYjsStore()
      .catch((error) => console.error('[yjs] Storing edits before sign-out failed:', error))
      .finally(() => setFlushed(true));
  }, []);

  const [unsaved, setUnsaved] = useState<UnsavedEdit[]>();
  const [confirmed, setConfirmed] = useState(false);
  const proceed = !!force || confirmed || unsaved?.length === 0;

  const signOutTriggeredRef = useRef(false);

  useEffect(() => {
    if (!proceed || signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;

    const handleSignOut = async () => {
      try {
        // `force` means the session is already gone: only this browser's state is left to clear.
        if (force) await teardownUserState();
        else await endSession({ wipe: true });
      } catch (error) {
        console.error('Sign out error:', error);
      }
      // Full page reload so every store and cache is rebuilt. No toast: the reload would cut it off, and this page already says it
      window.location.href = appConfig.aboutUrl;
    };

    handleSignOut();
  }, [proceed]);

  const keepEditing = () => {
    if (router.history.canGoBack()) router.history.back();
    else router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
  };

  return (
    <>
      <ContentPlaceholder className="h-svh" icon={HeartIcon} title="c:signing_out" />
      {!force && flushed && (
        <Suspense fallback={null}>
          <UnsavedEditsGate onChange={setUnsaved} open={!proceed} onConfirm={() => setConfirmed(true)} onCancel={keepEditing} />
        </Suspense>
      )}
    </>
  );
}
