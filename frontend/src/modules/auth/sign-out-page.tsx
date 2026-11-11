import { useRouter, useSearch } from '@tanstack/react-router';
import { CircleCheckIcon, CloudOffIcon, LoaderCircleIcon } from 'lucide-react';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { reportUnanswered, settleOrReport } from '~/lib/tracing';
import { AuthHeader } from '~/modules/auth/auth-header';
import { endSession } from '~/modules/auth/end-session';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import type { UnsavedEdit } from '~/modules/auth/unsaved-edits-dialog';
import { flushYjsStore } from '~/modules/common/blocknote/yjs-store';
import { Button } from '~/modules/ui/button';
import { lazyNamed } from '~/utils/lazy-named';
import { teardownUserState } from '~/utils/teardown-user-state';
import { longWaitMs, shortWaitMs } from '~/utils/wait-for';

const loadUnsavedEdits = () => import('~/modules/auth/unsaved-edits-dialog');
const UnsavedEditsGate = lazyNamed(loadUnsavedEdits, 'UnsavedEditsGate');
// The gate's chunk holds the editor's connections. It starts loading with this page, which the account sheet preloads:
// a slow connection then leaves the list of unsaved edits its time to answer.
void loadUnsavedEdits().catch(() => {});

/**
 * Signs out, after asking while some edits no server holds would go with the session: the dialog lists them live, and
 * sign-out continues by itself once they all saved. `force` (the account is gone) skips the question: nothing can save.
 * No read on this device keeps the session alive: a list that does not answer in time has nothing to ask. A sign-out
 * the server did not confirm keeps the page and the app as they were, and offers a retry and the way back. A confirmed
 * one opens the about page, or the same-origin page `redirect` names.
 */
export function SignOutPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const { force, redirect } = useSearch({ from: '/_public/auth/sign-out' });

  const [status, setStatus] = useState<'checking' | 'ending' | 'failed' | 'done'>(force ? 'ending' : 'checking');

  // Edits still queued for the store are written first, so the list holds them.
  const [flushed, setFlushed] = useState(!!force);
  useEffect(() => {
    if (!force) void settleOrReport('sign_out.yjs_flush', shortWaitMs, flushYjsStore()).then(() => setFlushed(true));
  }, []);

  const [unsaved, setUnsaved] = useState<UnsavedEdit[]>();
  const [confirmed, setConfirmed] = useState(false);
  const canSignOut = !!force || confirmed || unsaved?.length === 0;

  useEffect(() => {
    if (force || !flushed || unsaved) return;
    const timer = setTimeout(() => {
      reportUnanswered('sign_out.unsaved_check', longWaitMs);
      setUnsaved([]);
    }, longWaitMs);
    return () => clearTimeout(timer);
  }, [flushed, unsaved]);

  const signOut = async () => {
    setStatus('ending');
    try {
      // `force` means the session is already gone: only this browser's state is left to clear.
      if (force) await teardownUserState();
      else await endSession({ wipe: true });
    } catch (error) {
      console.error('Sign out error:', error);
      setStatus('failed');
      return;
    }
    setStatus('done');
    // Full page reload so every store and cache is rebuilt
    window.location.href = safeRedirectPath(redirect) ?? appConfig.aboutUrl;
  };

  const signOutTriggeredRef = useRef(false);
  useEffect(() => {
    if (!canSignOut || signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;
    signOut();
  }, [canSignOut]);

  const backToApp = () => {
    if (router.history.canGoBack()) router.history.back();
    else router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
  };

  const spinner = <LoaderCircleIcon className="text-muted-foreground size-12 animate-spin" strokeWidth={1.5} />;
  const header = {
    checking: { image: spinner, title: t('c:signing_out'), description: t('c:sign_out_step.checking') },
    ending: { image: spinner, title: t('c:signing_out'), description: t('c:sign_out_step.ending') },
    failed: {
      image: <CloudOffIcon className="text-muted-foreground size-12" strokeWidth={1.5} />,
      title: t('c:sign_out_failed'),
      description: t('c:sign_out_failed.text'),
    },
    done: {
      image: <CircleCheckIcon className="text-success size-12" strokeWidth={1.5} />,
      title: t('c:signed_out'),
      description: t('c:enjoy_your_day'),
    },
  }[status];

  return (
    <>
      {/* One live region across the states: a screen reader hears each change */}
      <div role="status">
        <AuthHeader {...header} />
      </div>
      {status === 'failed' && (
        <>
          <Button size="block" onClick={signOut}>
            {t('c:try_again')}
          </Button>
          <Button variant="glass" size="block" onClick={backToApp}>
            {t('c:go_to_app')}
          </Button>
        </>
      )}
      {!force && flushed && status === 'checking' && (
        <Suspense fallback={null}>
          <UnsavedEditsGate onChange={setUnsaved} open={!canSignOut} onConfirm={() => setConfirmed(true)} onCancel={backToApp} />
        </Suspense>
      )}
    </>
  );
}
