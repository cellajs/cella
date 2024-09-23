import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect, useState } from 'react';
import type { OnboardingStates } from '~/modules/home/onboarding';
import Onboarding from '~/modules/home/onboarding';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import { Dialog, DialogContent, DialogHiddenTitle } from '~/modules/ui/dialog';
import { useNavigationStore } from '~/store/navigation';

const Welcome = () => {
  const navigate = useNavigate();
  const { finishedOnboarding } = useNavigationStore();
  const [onboarding, setOnboarding] = useState<OnboardingStates>(finishedOnboarding ? 'completed' : 'start');

  const onOpenChange = () => {
    navigate({ to: config.defaultRedirectPath, replace: true });
  };

  useEffect(() => {
    if (finishedOnboarding) setOnboarding('completed');
  }, [finishedOnboarding]);

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange} defaultOpen={true}>
        <DialogContent
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
export default Welcome;
