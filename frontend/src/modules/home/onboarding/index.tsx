import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMounted from '~/hooks/use-mounted';
import { cn } from '~/lib/utils';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { Step, type StepItem, Stepper } from '~/modules/ui/stepper';
import { useUserStore } from '~/store/user';
import ConfettiExplosion from 'react-confetti-explosion';
import UpdateUserForm from '~/modules/users/update-user-form';
import type { Organization } from '~/types';
import InviteUsers from '../../common/invite-users';
import StepperFooter from './footer';
import { dialog } from '~/modules/common/dialoger/state';
import { toast } from 'sonner';
import { useNavigate } from '@tanstack/react-router';

const steps: StepItem[] = [
  { id: 'step-1', label: 'Create organization', optional: true },
  { id: 'step-2', label: 'Tune your profile', optional: false },
  { id: 'step-3', label: 'Invite others', optional: true },
];

interface OnboardingWelcomeProps {
  setWelcomeMessage: (val: boolean) => void;
}

const OnboardingWelcome = ({ setWelcomeMessage }: OnboardingWelcomeProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center text-center mx-auto space-y-6 p-4 max-w-[700px]">
      <h1 className="text-3xl font-bold">{t('common:onboarding_welcome')}</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">{t('common:onboarding_welcome.text')}</p>
      <Button onClick={() => setWelcomeMessage(false)}>
        {t('common:get_started')}
        <div className="-rotate-90 ml-4">
          <ArrowDown size={16} className="animate-bounce" />
        </div>
      </Button>
    </div>
  );
};

const OnboardingCompleted = () => {
  const [isExploding, _] = useState(true);
  const [closeCountDown, setCloseCountDown] = useState<number>(5);
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    const fadeTimer = setTimeout(() => {
      const timer = setInterval(() => {
        setCloseCountDown((prev) => {
          if (prev > 0) {
            return prev - 1;
          }
          return prev;
        });
      }, 1000);

      setTimeout(() => {
        dialog.remove();
        navigate({ to: '/home', replace: true });
        toast.success(t('common:success.onboarding'));
        clearInterval(timer);
      }, 5000);
    }, 500);

    return () => {
      clearTimeout(fadeTimer);
    };
  }, []);

  return (
    <div className="flex flex-col items-center text-center mx-auto space-y-6 p-4 max-w-[700px]">
      <h1 className="text-3xl font-bold">Great! Lets go.</h1>
      <p className="text-xl text-foreground/90 md:text-2xl font-light leading-7 pb-8">
        Have a look at the main menu to view a demo project and to create your own project.
      </p>
      {closeCountDown ? (
        <p>
          Dialog will close in <span className="text-2xl font-bold ml-2">{closeCountDown}</span>
        </p>
      ) : null}
      {isExploding && <ConfettiExplosion zIndex={10000} duration={5000} force={0.8} particleCount={250} height={'150vh'} width={1500} />}
    </div>
  );
};

const Onboarding = () => {
  const [welcomeMessage, setWelcomeMessage] = useState<boolean>(true);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [onboardingCompleted, setOnboardingCompleted] = useState<boolean>(false);

  const { hasStarted } = useMounted();
  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-1' : 'opacity-0 scale-95 translate-y-4'}`;

  const user = useUserStore((state) => state.user);

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
        {welcomeMessage ? (
          <OnboardingWelcome setWelcomeMessage={setWelcomeMessage} />
        ) : onboardingCompleted ? (
          <OnboardingCompleted />
        ) : (
          <div className={cn('mx-auto mt-8 flex flex-col justify-center gap-4 p-4 sm:w-10/12 max-w-[800px]', animateClass)}>
            <Stepper initialStep={0} steps={steps} orientation="vertical">
              {steps.map(({ label, id }) => (
                <Step key={label} label={label}>
                  <Card>
                    <CardHeader>
                      <CardDescription className="font-light">
                        {id === 'step-1' && "Let's get started by creating your organization."}
                        {id === 'step-2' && `Hi ${user.firstName}, this is you?`}
                        {id === 'step-3' && `Invite one or more team members of ${organization?.name} to Cella.`}
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      {id === 'step-1' && (
                        <CreateOrganizationForm callback={(organization) => setOrganization(organization)} labelDirection="top">
                          <StepperFooter />
                        </CreateOrganizationForm>
                      )}
                      {id === 'step-2' && (
                        <UpdateUserForm user={user} hiddenFields={['email', 'bio', 'newsletter']}>
                          <StepperFooter organization={organization} />
                        </UpdateUserForm>
                      )}
                      {id === 'step-3' && (
                        <InviteUsers organization={organization} type="organization" mode="email">
                          <StepperFooter organization={organization} setOnboardingCompleted={setOnboardingCompleted} />
                        </InviteUsers>
                      )}
                    </CardContent>
                  </Card>
                </Step>
              ))}
            </Stepper>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
