import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import type { OnboardingStates } from '~/modules/home/onboarding/steps';
import Onboarding from '~/modules/home/onboarding/steps';
import { Dialog, DialogContent, DialogHiddenTitle } from '~/modules/ui/dialog';
import { useNavigationStore } from '~/store/navigation';
import { isElementInteractive } from '~/utils/is-el-interactive';

const WelcomePage = () => {
  const navigate = useNavigate();
  const { finishedOnboarding } = useNavigationStore();
  const [onboarding, setOnboarding] = useState<OnboardingStates>(finishedOnboarding ? 'completed' : 'start');

  const onOpenChange = () => {
    navigate({ to: config.defaultRedirectPath, replace: true });
  };

  // Close onboarding on escape key if not focused on form
  const onEscapeKeyDown = (e: KeyboardEvent) => {
    e.preventDefault();

    const activeElement = document.activeElement;
    if (isElementInteractive(activeElement)) return;
    setOnboarding('completed');
  };

  useEffect(() => {
    if (finishedOnboarding) setOnboarding('completed');
  }, [finishedOnboarding]);

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange} defaultOpen={true}>
        <DialogContent
          onEscapeKeyDown={onEscapeKeyDown}
          aria-describedby={undefined}
          className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75 overflow-y-auto"
        >
          <DialogHiddenTitle>Welcome</DialogHiddenTitle>
          <Onboarding onboarding={onboarding} onboardingToStepper={() => setOnboarding('stepper')} />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
};
export default WelcomePage;
