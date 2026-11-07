import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import confetti from 'canvas-confetti';
import { HomeIcon, PlusIcon, UndoIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { getMenuSection } from '~/lib/entity-modules';
import { useUpdateSelfFlagsMutation } from '~/modules/me/query';
import { useNavigationStore } from '~/modules/navigation/navigation-store';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

/** One confetti burst over the nearest positioned ancestor, on mount. */
function Confetti() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    const fireConfetti = confetti.create(canvasRef.current, { resize: true, useWorker: true });
    fireConfetti({ spread: 200, origin: { y: 0.45 }, particleCount: 200, startVelocity: 25 });
    return () => fireConfetti.reset();
  }, []);

  return <canvas ref={canvasRef} className="pointer-events-none absolute top-0 left-0 size-full" />;
}

export function OnboardingCompleted() {
  const { t } = useTranslation();
  const user = useCurrentUser();
  const resetSections = useNavigationStore((state) => state.resetSections);

  const { mutate } = useUpdateSelfFlagsMutation();

  const didRunRef = useRef(false);
  const createButtonRef = useRef<HTMLButtonElement>(null);

  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const hasOrganization = organizations.length > 0;

  // Without an organization, offer the same create action the menu offers; otherwise the text points to the navigation.
  const createOrganization = getMenuSection('organization')?.createAction;

  useEffect(() => {
    // Run once, after the organization list has settled.
    if (didRunRef.current || orgQuery.isFetching) return;

    didRunRef.current = true;
    mutate({ userFlags: { finishedOnboarding: true } });
    if (hasOrganization) resetSections();
  }, [mutate, resetSections, hasOrganization, orgQuery.isFetching]);

  return (
    <div className="relative z-1 flex h-svh min-w-full flex-col items-center justify-center gap-6 p-4 text-center">
      <Confetti />

      {/* The arrow points at the organization in the rail; after a skip the rail holds only the create button */}
      {user.userFlags.finishedOnboarding && hasOrganization && (
        <UndoIcon strokeWidth={0.1} className="text-primary -mt-52 -mb-12 size-100 scale-y-75 rotate-30 max-md:hidden md:-translate-x-24" />
      )}
      <h1 className="text-3xl font-bold">{t('c:onboarding_completed')}</h1>
      <p className="text-foreground max-w-md pb-8 text-xl md:text-2xl md:leading-9">{t('c:onboarding_completed.text')}</p>

      {/* Both actions appear together, once the organization list has settled and the flag is set: neither moves under the pointer. */}
      {user.userFlags.finishedOnboarding && (
        <div className="flex gap-2 max-sm:w-full max-sm:flex-col">
          {!hasOrganization && createOrganization && (
            <Button ref={createButtonRef} variant="secondary" onClick={() => createOrganization(createButtonRef)}>
              <PlusIcon />
              {t('c:create_resource', { resource: t('c:organization') })}
            </Button>
          )}
          {/* Replaces the history entry: going back to welcome would only redirect forward again. */}
          <Button variant="secondary" render={<Link to="/home" replace />}>
            <HomeIcon />
            {t('c:home')}
          </Button>
        </div>
      )}
    </div>
  );
}
