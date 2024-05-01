import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import useMounted from '~/hooks/use-mounted';
import { cn } from '~/lib/utils';
import CreateOrganizationForm from '~/modules/organizations/create-organization-form';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { Step, type StepItem, Stepper } from '~/modules/common/stepper';
import { useUserStore } from '~/store/user';
import UpdateUserForm from '~/modules/users/update-user-form';
import type { Organization } from '~/types';
import InviteUsers from '../../common/invite-users';
import StepperFooter from './footer';
import { OnboardingStart } from './start';

const steps: StepItem[] = [
  { id: 'profile', label: 'Tune your profile', optional: true },
  { id: 'organization', label: 'Create organization', optional: true },
  { id: 'invitation', label: 'Invite others', optional: true },
];

export type OnboardingStates = 'start' | 'stepper' | 'completed';

interface OnboardingProps {
  onboarding: OnboardingStates;
  setOnboarding: (value: OnboardingStates) => void;
}

const Onboarding = ({ onboarding = 'start', setOnboarding }: OnboardingProps) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const { hasStarted } = useMounted();
  const { t } = useTranslation();
  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-1' : 'opacity-0 scale-95 translate-y-4'}`;

  const user = useUserStore((state) => state.user);

  const onCreateOrganization = (organization: Organization) => {
    setOrganization(organization);
  };

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
        {onboarding === 'start' && <OnboardingStart setOnboarding={setOnboarding} />}
        {onboarding === 'stepper' && (
          <div className={cn('mx-auto mt-8 flex flex-col justify-center gap-4 px-4 py-8 sm:w-10/12 max-w-[800px]', animateClass)}>
            <Stepper initialStep={0} steps={steps} orientation="vertical">
              {steps.map(({ label, id }) => (
                <Step key={label} label={label}>
                  <Card>
                    <CardHeader>
                      <CardDescription className="font-light">
                        {id === 'profile' && t('common:onboarding_step1', { name: user.firstName })}
                        {id === 'organization' && t('common:onboarding_step2')}
                        {id === 'invitation' && t('common:onboarding_step3', { organizationName: organization?.name })}
                      </CardDescription>
                    </CardHeader>

                    <CardContent>
                      {id === 'profile' && (
                        <UpdateUserForm user={user} hiddenFields={['email', 'bio', 'newsletter']}>
                          <StepperFooter setOnboarding={setOnboarding} />
                        </UpdateUserForm>
                      )}
                      {id === 'organization' && (
                        <CreateOrganizationForm callback={onCreateOrganization}>
                          <StepperFooter setOnboarding={setOnboarding} />
                        </CreateOrganizationForm>
                      )}
                      {id === 'invitation' && (
                        <InviteUsers organization={organization} type="organization" mode="email">
                          <StepperFooter organization={organization} setOnboarding={setOnboarding} />
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
