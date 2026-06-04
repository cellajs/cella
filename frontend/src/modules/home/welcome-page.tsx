import { useState } from 'react';
import type { Organization } from 'sdk';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Onboarding } from '~/modules/home/onboarding/steps';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { useUserStore } from '~/modules/user/user-store';

/**
 * Welcome page shown to new users. Contains onboarding flow and welcome message. Only shown if user has not completed onboarding.
 */
function WelcomePage() {
  const { user } = useUserStore();

  const [onboarding, setOnboardingState] = useState<OnboardingStates>(
    user.userFlags.finishedOnboarding ? 'completed' : 'start',
  );
  const [createdOrganization, setCreatedOrganization] = useState<Organization | null>(null);
  // null = seed didn't run yet (e.g. user already had an org or skipped org step);
  // true/false = result of the seed attempt from the org-create callback.
  const [seeded, setSeeded] = useState<boolean | null>(null);

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      // Don't close onboarding on escape when focused on a form field
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    }
    if (!nextOpen) setOnboardingState('completed');
  };

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange} defaultOpen={true}>
        <DialogContent
          aria-describedby={undefined}
          className="mt-0 flex h-screen min-w-full flex-col overflow-y-auto rounded-none border-0 bg-background/75 p-0 max-sm:max-h-[100dvh]"
        >
          <span className="sr-only">
            <DialogTitle>Welcome</DialogTitle>
          </span>
          <Onboarding
            onboarding={onboarding}
            setOnboardingState={setOnboardingState}
            createdOrganization={createdOrganization}
            setCreatedOrganization={setCreatedOrganization}
            setSeeded={setSeeded}
          />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted createdOrganization={createdOrganization} seeded={seeded} />}
    </>
  );
}

export default WelcomePage;
