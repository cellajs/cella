import { useEffect, useState } from 'react';
import useMounted from '~/hooks/use-mounted';
import { Step, Stepper } from '~/modules/common/stepper';
import StepperFooter from '~/modules/home/onboarding/footer';
import { onboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { WelcomeText } from '~/modules/home/onboarding/welcome-text';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import type { Organization } from '~/modules/organizations/types';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import InviteUsers from '~/modules/users/invite-users';
import UpdateUserForm from '~/modules/users/update-user-form';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

export type OnboardingStates = 'start' | 'stepper' | 'completed';

interface OnboardingProps {
  onboarding: OnboardingStates;
  onboardingStateChange: (newState: Exclude<OnboardingStates, 'start'>) => void;
}

const Onboarding = ({ onboarding = 'start', onboardingStateChange }: OnboardingProps) => {
  const { user } = useUserStore();
  const { hasStarted } = useMounted();
  const { menu } = useNavigationStore();

  const [steps, setSteps] = useState(onboardingSteps);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-100' : 'opacity-0 scale-95 translate-y-4'}`;

  useEffect(() => {
    if (menu.organization.length > 0) setSteps([onboardingSteps[0]]);
  }, []);

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
        {onboarding === 'start' && <WelcomeText onboardingToStepper={() => onboardingStateChange('stepper')} />}
        {onboarding === 'stepper' && (
          <div className={cn('mx-auto mt-0 flex flex-col justify-center gap-4 px-4 py-8 sm:w-10/12 max-w-3xl', animateClass)}>
            {steps.length === 1 && <h2 className="text-lg font-semibold flex justify-center">{steps[0].label}</h2>}
            <Stepper
              initialStep={0}
              steps={steps}
              onClickStep={(currentStep) => {
                if (currentStep === steps.length - 1) onboardingStateChange('completed');
              }}
              orientation="vertical"
            >
              {steps.map(({ description, label, id }) => (
                <Step key={label} label={label}>
                  <Card>
                    {description && (
                      <CardHeader>
                        <CardDescription className="font-light">{description}</CardDescription>
                      </CardHeader>
                    )}
                    <CardContent>
                      {id === 'profile' && (
                        <UpdateUserForm user={user} hiddenFields={['email', 'newsletter', 'slug', 'language']}>
                          <StepperFooter />
                        </UpdateUserForm>
                      )}
                      {id === 'organization' && (
                        <CreateOrganizationForm
                          callback={(newOrganization: Organization) => {
                            setOrganization(newOrganization);
                          }}
                        >
                          <StepperFooter />
                        </CreateOrganizationForm>
                      )}
                      {id === 'invitation' && organization && (
                        <InviteUsers entity={organization} mode="email">
                          <StepperFooter />
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
