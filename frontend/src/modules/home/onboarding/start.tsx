import { config } from 'config';
import { ArrowDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';

interface OnboardingStartProps {
  onboardingToStepper: () => void;
}

export const OnboardingStart = ({ onboardingToStepper }: OnboardingStartProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center mx-auto space-y-6 p-4 max-w-3xl">
      <h1 className="text-3xl font-bold">{t('common:onboarding_welcome', { appName: config.name })}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">{t('common:onboarding_welcome.text')}</p>
      <Button onClick={onboardingToStepper} className="max-sm:w-full">
        {t('common:get_started')}
        <div className="-rotate-90 ml-4">
          <ArrowDown size={16} className="animate-bounce" />
        </div>
      </Button>
    </div>
  );
};
