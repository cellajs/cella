import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useState } from 'react';
import type { OnboardingStates } from '~/modules/home/onboarding';
import Onboarding from '~/modules/home/onboarding';
import { Dialog, DialogContent } from '~/modules/ui/dialog';
import { useUserStore } from '~/store/user';
import { OnboardingCompleted } from './onboarding/completed';

const Welcome = () => {
  const navigate = useNavigate();
  const { finishOnboarding } = useUserStore();
  const [onboarding, setOnboarding] = useState<OnboardingStates>(finishOnboarding ? 'completed' : 'start');

  const onOpenChange = () => {
    navigate({ to: config.defaultRedirectPath, replace: true });
  };

  return (
    <>
      <Dialog open={onboarding !== 'completed'} onOpenChange={onOpenChange} defaultOpen={true}>
        <DialogContent className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75 overflow-y-auto">
          <Onboarding onboarding={onboarding} setOnboarding={setOnboarding} />
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
};
export default Welcome;
