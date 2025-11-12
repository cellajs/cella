import { DialogTitle } from '@radix-ui/react-dialog';
import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { useState } from 'react';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import Onboarding from '~/modules/home/onboarding/steps';
import { Dialog, DialogContent } from '~/modules/ui/dialog';
import { useUserStore } from '~/store/user';
import { isElementInteractive } from '~/utils/is-el-interactive';

const WelcomePage = () => {
  const { user } = useUserStore();

  const [onboarding, setOnboardingState] = useState<OnboardingStates>(user.userFlags.finishedOnboarding ? 'completed' : 'start');

  const onOpenChange = (openState: boolean) => {
    if (!openState) setOnboardingState('completed');
  };

  // Close onboarding on escape key if not focused on form
  const onEscapeKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();

    const activeElement = document.activeElement;
    if (isElementInteractive(activeElement)) return;
    setOnboardingState('completed');
  };

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange} defaultOpen={true}>
        <DialogContent
          onEscapeKeyDown={onEscapeKeyDown}
          aria-describedby={undefined}
          className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75 overflow-y-auto"
        >
          <VisuallyHidden>
            <DialogTitle>Welcome</DialogTitle>
          </VisuallyHidden>
          <Onboarding onboarding={onboarding} setOnboardingState={setOnboardingState} />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
};
export default WelcomePage;
