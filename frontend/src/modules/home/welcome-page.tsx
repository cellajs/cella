import { useState } from 'react';
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
          className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75 overflow-y-auto"
        >
          <span className="sr-only">
            <DialogTitle>Welcome</DialogTitle>
          </span>
          <Onboarding onboarding={onboarding} setOnboardingState={setOnboardingState} />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
}
export default WelcomePage;
