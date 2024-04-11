import { ArrowDown } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMounted from '~/hooks/use-mounted';
import { cn } from '~/lib/utils';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { useUserStore } from '~/store/user';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Step, type StepItem, Stepper, useStepper } from '~/modules/ui/stepper';

import Footer from './footer';
import { dialog } from '~/modules/common/dialoger/state';
import UpdateUserForm from '~/modules/users/update-user-form';
import InviteUsers from '../invite-users';


const steps: StepItem[] = [
  { id: 'step-1', label: 'Create organization', optional: false },
  { id: 'step-2', label: 'Tune your profile', optional: false },
  { id: 'step-3', label: 'Invite team', optional: true },
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

const Onboarding = () => {
  const [welcomeMessage, setWelcomeMessage] = useState<boolean>(true);
  const { hasStarted } = useMounted();
  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-1' : 'opacity-0 scale-95 translate-y-4'}`;

  const { hasCompletedAllSteps, activeStep } = useStepper();

  const user = useUserStore((state) => state.user);

  useEffect(() => {
    if (!hasCompletedAllSteps) return;

    // Use activeStep to close the stepper if number is beyond the last step
    if (activeStep > 3) dialog.remove();
  }, [hasCompletedAllSteps, activeStep]);

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
        {welcomeMessage ? (
          <OnboardingWelcome setWelcomeMessage={setWelcomeMessage} />
        ) : (
          <div className={cn('mx-auto mt-8 flex flex-col justify-center gap-4 p-4 sm:w-10/12 max-w-[800px]', animateClass)}>
            <Stepper initialStep={0} steps={steps} orientation="vertical">
              {steps.map(({ label, id }) => {
                if (id === 'step-1') {
                  return (
                    <Step key={label} label={label}>
                      <Card>
                        <CardHeader>
                          <CardDescription className="font-light">Let's get started by creating your organization.</CardDescription>
                        </CardHeader>

                        <CardContent>
                          <CreateOrganizationForm labelDirection="top">
                            <Footer />
                          </CreateOrganizationForm>
                        </CardContent>
                      </Card>
                    </Step>
                  );
                }

                if (id === 'step-2') {
                  return (
                    <Step key={label} label={label}>
                      <Card>
                        <CardHeader>
                          <CardDescription className="font-light">Hi {user.firstName}, this is you?</CardDescription>
                        </CardHeader>

                        <CardContent>
                          <UpdateUserForm user={user} hiddenFields={['email', 'bio', 'newsletter']}>
                            <Footer />
                          </UpdateUserForm>
                        </CardContent>
                      </Card>
                    </Step>
                  );
                }

                if (id === 'step-3') {
                  return (
                    <Step key={label} label={label}>
                      <Card>
                        <CardHeader>
                          <CardDescription className="font-light">Invite one or more team members to Cella.</CardDescription>
                        </CardHeader>

                        <CardContent>
                          <InviteUsers type="organization" mode="email">
                            <Footer />
                          </InviteUsers>
                        </CardContent>
                      </Card>
                    </Step>
                  );
                }
              })}
            </Stepper>
          </div>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
