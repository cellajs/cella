import { useRouter, useSearch } from '@tanstack/react-router';
import { HeartIcon, ShieldAlertIcon } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { ApiError } from '~/lib/api';
import { endSession } from '~/modules/auth/end-session';
import type { UnsavedEdit } from '~/modules/auth/unsaved-edits-dialog';
import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { Button } from '~/modules/ui/button';
import { lazyNamed } from '~/utils/lazy-named';
import { teardownUserState } from '~/utils/teardown-user-state';

const UnsavedEditsGate = lazyNamed(() => import('~/modules/auth/unsaved-edits-dialog'), 'UnsavedEditsGate');

/**
 * Signs out, after asking while some edits no server holds would go with the session: the dialog lists them live, and
 * sign-out continues by itself once they all saved. `force` (the account is gone) skips the question: nothing can save.
 * A sign-out the server did not confirm keeps the page, which says this browser is still signed in and offers a retry.
 */
export function SignOutPage() {
  const { t } = useTranslation();
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
  const canSignOut = !!force || confirmed || unsaved?.length === 0;

  const signOutTriggeredRef = useRef(false);
  const [failed, setFailed] = useState(false);

  const handleSignOut = async () => {
    setFailed(false);
    try {
      // `force` means the session is already gone: only this browser's state is left to clear.
      if (force) await teardownUserState();
      else await endSession({ wipe: true });
    } catch (error) {
      console.error('Sign out error:', error);
      // Only a 401 says no session is left to end: after any other failure the cookie and the session still work.
      const signedOut = force || (error instanceof ApiError && error.status === 401);
      if (!signedOut) {
        setFailed(true);
        return;
      }
    }
    // Full page reload so every store and cache is rebuilt. No toast: the reload would cut it off, and this page already says it
    window.location.href = appConfig.aboutUrl;
  };

  useEffect(() => {
    if (!canSignOut || signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;
    handleSignOut();
  }, [canSignOut]);

  const keepEditing = () => {
    if (router.history.canGoBack()) router.history.back();
    else router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
  };

  if (failed) {
    return (
      <ContentPlaceholder className="h-svh" icon={ShieldAlertIcon} title="c:sign_out_failed">
        <Button onClick={handleSignOut}>{t('c:sign_out')}</Button>
      </ContentPlaceholder>
    );
  }

  return (
    <>
      <ContentPlaceholder className="h-svh" icon={HeartIcon} title="c:signing_out" />
      {!force && flushed && (
        <Suspense fallback={null}>
          <UnsavedEditsGate onChange={setUnsaved} open={!canSignOut} onConfirm={() => setConfirmed(true)} onCancel={keepEditing} />
        </Suspense>
      )}
    </>
  );
}
