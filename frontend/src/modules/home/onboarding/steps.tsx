import { useInfiniteQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { useMountedState } from '~/hooks/use-mounted-state';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { Step, Stepper } from '~/modules/common/stepper/stepper';
import { StepperFooter } from '~/modules/home/onboarding/footer';
import { onboardingSteps } from '~/modules/home/onboarding/onboarding-config';
import { seedOnboardingDemoData } from '~/modules/home/onboarding/onboarding-seed';
import { WelcomeText } from '~/modules/home/onboarding/welcome-text';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { InviteUsers } from '~/modules/user/invite-users';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';
import { cn } from '~/utils/cn';

export type OnboardingStates = 'start' | 'stepper' | 'completed';

interface OnboardingProps {
  onboarding: OnboardingStates;
  setOnboardingState: (newState: Exclude<OnboardingStates, 'start'>) => void;
  createdOrganization: Organization | null;
  setCreatedOrganization: (organization: Organization | null) => void;
  setSeeded: (seeded: boolean) => void;
}

export function Onboarding({
  onboarding = 'start',
  setOnboardingState,
  createdOrganization,
  setCreatedOrganization,
  setSeeded,
}: OnboardingProps) {
  const user = useCurrentUser();
  const { hasStarted } = useMountedState();
  const { t } = useTranslation();

  const [organization, setOrganization] = useState<Organization | null>(createdOrganization);

  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-100' : 'opacity-0 scale-95 translate-y-4'}`;

  // Fetch organizations to determine if user has created any
  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const hasOrganizations = organizations.length > 0;

  // Lock steps at mount: if user already has orgs, show only profile step.
  // Don't shrink mid-flow when an org is created during onboarding.
  const [steps] = useState(() => (hasOrganizations ? [onboardingSteps[0]] : onboardingSteps));

  return (
    <div className="flex min-h-[90vh] flex-col items-center sm:min-h-screen">
      <div className="mt-auto mb-auto w-full">
        {onboarding === 'start' && <WelcomeText onboardingToStepper={() => setOnboardingState('stepper')} />}
        {onboarding === 'stepper' && (
          <div
            className={cn(
              'mx-auto mt-0 flex max-w-3xl flex-col justify-center gap-4 px-4 py-8 sm:w-10/12',
              animateClass,
            )}
          >
            {steps.length === 1 && <h2 className="flex justify-center font-semibold text-lg">{steps[0].label}</h2>}
            <Stepper
              initialStep={0}
              steps={steps}
              onClickStep={(newStep, setStep) => {
                setStep(newStep);
              }}
              orientation="vertical"
            >
              {steps.map(({ description, label, id }) => (
                <Step
                  key={id}
                  label={label}
                  isKeepError={id !== 'profile'}
                  checkIcon={id === 'organization' && !organization ? XIcon : undefined}
                >
                  <Card>
                    {description && (
                      <CardHeader>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                    )}
                    <CardContent>
                      {id === 'profile' && (
                        <UpdateUserForm user={user} compact>
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </UpdateUserForm>
                      )}
                      {id === 'organization' && !organization && (
                        <CreateOrganizationForm
                          callback={async (args: CallbackArgs<Organization>) => {
                            if (args.status === 'success') {
                              setOrganization(args.data);
                              setCreatedOrganization(args.data);
                              // Await seeding here so the user cannot leave onboarding before the
                              // demo workspace + projects are persisted and the menu cache is primed.
                              const result = await seedOnboardingDemoData(args.data);
                              setSeeded(result);
                            }
                          }}
                        >
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </CreateOrganizationForm>
                      )}
                      {id === 'organization' && !!organization && (
                        <p className="font-normal text-sm opacity-80">{t('c:already_created_org.text')}</p>
                      )}
                      {id === 'invitation' && organization && (
                        <InviteUsers channel={organization} mode="email">
                          <StepperFooter setOnboardingState={setOnboardingState} />
                        </InviteUsers>
                      )}
                      {id === 'invitation' && !organization && (
                        <div>
                          <p className="mb-4 font-normal text-sm opacity-80">{t('c:need_org_to_invite.text')}</p>
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
}
