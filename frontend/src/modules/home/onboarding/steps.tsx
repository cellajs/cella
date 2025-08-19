import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
}

const Onboarding = ({ onboarding = 'start', setOnboardingState }: OnboardingProps) => {
  const { user } = useUserStore();
  const { hasStarted } = useMounted();
  const { menu } = useNavigationStore();
  const { t } = useTranslation();

  const [steps, setSteps] = useState(onboardingSteps);
  const [organization, setOrganization] = useState<Organization | null>(null);

  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-100' : 'opacity-0 scale-95 translate-y-4'}`;

  useEffect(() => {
    if (menu.organization.length > 0) setSteps([onboardingSteps[0]]);
  }, []);

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
        {onboarding === 'start' && <WelcomeText onboardingToStepper={() => setOnboardingState('stepper')} />}
        {onboarding === 'stepper' && (
          <div className={cn('mx-auto mt-0 flex flex-col justify-center gap-4 px-4 py-8 sm:w-10/12 max-w-3xl', animateClass)}>
            {steps.length === 1 && <h2 className="text-lg font-semibold flex justify-center">{steps[0].label}</h2>}
            <Stepper
              initialStep={0}
              steps={steps}
              onClickStep={(newStep, setStep) => {
                setStep(newStep);
              }}
              orientation="vertical"
            >
              {steps.map(({ description, label, id }) => (
                <Step key={id} label={label} isKeepError={id !== 'profile'} checkIcon={id === 'organization' && !organization ? X : undefined}>
                  <Card>
                    {description && (
                      <CardHeader>
                        <CardDescription className="font-light">{description}</CardDescription>
                      </CardHeader>
                    )}
                    <CardContent>
                      {id === 'profile' && (
                        <UpdateUserForm user={user} hiddenFields={['email', 'newsletter', 'slug', 'language']}>
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </UpdateUserForm>
                      )}
                      {id === 'organization' && !organization && (
                        <CreateOrganizationForm
                          callback={(newOrganization: Organization) => {
                            setOrganization(newOrganization);
                          }}
                        >
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </CreateOrganizationForm>
                      )}
                      {id === 'organization' && !!organization && (
                        <p className="opacity-80 text-sm font-medium">{t('common:already_created_org.text')}</p>
                      )}
                      {id === 'invitation' && organization && (
                        <InviteUsers entity={organization} mode="email">
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </InviteUsers>
                      )}
                      {id === 'invitation' && !organization && (
                        <div>
                          <p className="opacity-80 text-sm font-medium mb-4">{t('common:need_org_to_invite.text')}</p>
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </div>
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
