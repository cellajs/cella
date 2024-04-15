import { Suspense, lazy, useState } from 'react';
import type { OnboardingStates } from '~/modules/home/onboarding';
import { Dialog, DialogContent } from '~/modules/ui/dialog';
import { OnboardingCompleted } from './onboarding/completed';

const Onboarding = lazy(() => import('~/modules/home/onboarding'));

const Welcome = () => {
  const [onboarding, setOnboarding] = useState<OnboardingStates>('start');

  return (
    <>
      <Dialog open={onboarding !== 'completed'} defaultOpen={true}>
        <DialogContent className="min-w-full h-screen border-0 p-0 rounded-none flex flex-col mt-0 bg-background/75">
          <Suspense>
            <Onboarding onboarding={onboarding} setOnboarding={setOnboarding} />
          </Suspense>
        </DialogContent>
      </Dialog>

      {onboarding === 'completed' && <OnboardingCompleted />}
    </>
  );
};

export default Welcome;
