import { useState } from 'react';
import { CloseButton } from '~/modules/common/close-button';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Onboarding } from '~/modules/home/onboarding/steps';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { useCurrentUser } from '~/modules/user/user-store';

function WelcomePage() {
  const user = useCurrentUser();

  const [onboarding, setOnboardingState] = useState<OnboardingStates>(user.userFlags.finishedOnboarding ? 'completed' : 'start');

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      // Escape inside a form field must not close onboarding
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    }
    if (!nextOpen) setOnboardingState('completed');
  };

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange}>
        <DialogContent className="mt-0 flex h-dvh max-h-none min-w-full flex-col overflow-y-auto rounded-none border-0 bg-background/75 p-0">
          <span className="sr-only">
            <DialogTitle>Welcome</DialogTitle>
          </span>
          <CloseButton onClick={() => setOnboardingState('completed')} className="absolute top-4 right-4 z-10" />
          <Onboarding onboarding={onboarding} setOnboardingState={setOnboardingState} />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
}

export { WelcomePage };
