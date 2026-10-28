import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloseButton } from '~/modules/common/close-button';
import { OnboardingCompleted } from '~/modules/home/onboarding/completed';
import { Onboarding, type OnboardingState } from '~/modules/home/onboarding/onboarding';
import { Dialog, DialogContent, DialogTitle } from '~/modules/ui/dialog';
import { useCurrentUser } from '~/modules/user/user-store';

export function WelcomePage() {
  const { t } = useTranslation();
  const user = useCurrentUser();

  const [onboardingState, setOnboardingState] = useState<OnboardingState>(user.userFlags.finishedOnboarding ? 'completed' : 'start');

  const complete = () => setOnboardingState('completed');

  const handleOpenChange = (nextOpen: boolean, eventDetails: { reason: string }) => {
    if (nextOpen) return;
    // Escape inside a form field must not close onboarding
    if (eventDetails.reason === 'escape-key' && document.activeElement?.matches('input, textarea, select, [contenteditable="true"]')) return;
    complete();
  };

  return (
    <>
      <Dialog open={onboardingState !== 'completed'} onOpenChange={handleOpenChange}>
        <DialogContent className="flex h-dvh max-h-none min-w-full flex-col rounded-none bg-background/75 p-0">
          <DialogTitle className="sr-only">{t('c:onboarding_welcome')}</DialogTitle>
          <CloseButton onClick={complete} className="absolute top-4 right-4 z-10" />
          <Onboarding state={onboardingState} onStart={() => setOnboardingState('stepper')} onComplete={complete} />
        </DialogContent>
      </Dialog>

      {onboardingState === 'completed' && <OnboardingCompleted />}
    </>
  );
}
