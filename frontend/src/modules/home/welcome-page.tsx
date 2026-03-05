import { useState } from 'react';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import { Onboarding } from '~/modules/home/onboarding/steps';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { useUserStore } from '~/store/user';
import { isElementInteractive } from '~/utils/is-el-interactive';

function WelcomePage() {
  const { user } = useUserStore();

  const [onboarding, setOnboardingState] = useState<OnboardingStates>(
    user.userFlags.finishedOnboarding ? 'completed' : 'start',
  );

  const onOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (!nextOpen && eventDetails.reason === 'escape-key') {
      // Close onboarding on escape key if not focused on form
      const activeElement = document.activeElement;
      if (isElementInteractive(activeElement)) return;
      setOnboardingState('completed');
      return;
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
