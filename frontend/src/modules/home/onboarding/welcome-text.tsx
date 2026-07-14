import { ArrowDownIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { TextEffect } from '~/modules/common/text-effect';
import { Button } from '~/modules/ui/button';

interface WelcomeTextProps {
  onboardingToStepper: () => void;
}

/**
 * Welcome text shown at the start of onboarding, before the stepper. Contains a brief intro and a call to action to start the stepper.
 */
export const WelcomeText = ({ onboardingToStepper }: WelcomeTextProps) => {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center space-y-6 p-8 text-center">
      <h1 className="font-bold text-2xl">{t('c:onboarding_welcome', { appName: appConfig.name })}</h1>
      <div className="pb-8 text-foreground/90 leading-7 md:text-2xl">
        <TextEffect
          text={t('c:onboarding_welcome.text', { appName: appConfig.name })}
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
};
