import { useState } from 'react';
import { CloseButton } from '~/modules/common/close-button';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import { Onboarding, type OnboardingState } from '~/modules/home/onboarding/onboarding';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { useCurrentUser } from '~/modules/user/user-store';

function WelcomePage() {
  const user = useCurrentUser();

  const [onboardingState, setOnboardingState] = useState<OnboardingState>(user.userFlags.finishedOnboarding ? 'completed' : 'start');

  const handleOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      // Escape inside a form field must not close onboarding
      if (document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    }
    if (!nextOpen) setOnboardingState('completed');
  };

  return (
    <>
      <Dialog open={onboardingState !== 'completed'} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-dvh max-h-none min-w-full flex-col rounded-none bg-background/75 p-0">
          <span className="sr-only">
            <DialogTitle>Welcome</DialogTitle>
          </span>
          <CloseButton onClick={() => setOnboardingState('completed')} className="absolute top-4 right-4 z-10" />
          <Onboarding state={onboardingState} onStart={() => setOnboardingState('stepper')} onComplete={() => setOnboardingState('completed')} />
        </DialogContent>
      </Dialog>

      {onboardingState === 'completed' && <OnboardingCompleted />}
    </>
  );
}

export { WelcomePage };
