import { config } from 'config';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TextEffect } from '~/modules/common/text-effect';
import { Button } from '~/modules/ui/button';

interface WelcomeTextProps {
  onboardingToStepper: () => void;
}

export const WelcomeText = ({ onboardingToStepper }: WelcomeTextProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center mx-auto space-y-6 p-8 max-w-3xl">
      <h1 className="text-2xl font-bold">{t('common:onboarding_welcome', { appName: config.name })}</h1>
      <div className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">
        <TextEffect text={t('common:onboarding_welcome.text', { appName: config.name })} />
      </div>
      <Button onClick={onboardingToStepper} className="max-sm:w-full">
        {t('common:get_started')}
        <div className="-rotate-90 ml-4">
          <ArrowDown size={16} className="animate-bounce" />
        </div>
      </Button>
    </div>
  );
};
