import { ArrowDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TextEffect } from '~/modules/common/text-effect';
import type { Invitation } from '~/modules/me/types';
import { Button } from '~/modules/ui/button';

interface WelcomeTextProps {
  invitations: Invitation[];
  onboardingToStepper: () => void;
}

export function WelcomeText({ invitations, onboardingToStepper }: WelcomeTextProps) {
  const { t } = useTranslation();

  // An invited user is greeted with what they came for, not with the pitch for starting something new.
  const [firstInvitation] = invitations;
  let text = t('c:onboarding_welcome.text', { appName: appConfig.name });
  if (invitations.length > 1) text = t('c:onboarding_welcome_invitations.text', { count: invitations.length });
  else if (firstInvitation) text = t('c:onboarding_welcome_invited.text', { entityName: firstInvitation.entity.name });

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center space-y-6 p-8 text-center">
      <h1 className="font-bold text-2xl">{t('c:onboarding_welcome', { appName: appConfig.name })}</h1>
      <div className="pb-8 text-foreground/90 leading-7 md:text-2xl">
        <TextEffect
          text={text}
          className="text-center font-medium text-2xl sm:text-4xl sm:leading-12 md:text-5xl md:leading-16"
        />
      </div>
      <Button onClick={onboardingToStepper} className="max-sm:w-full">
        {t('c:get_started')}
        <div className="ml-4 -rotate-90">
          <ArrowDownIcon className="animate-bounce" />
        </div>
      </Button>
    </div>
  );
}
