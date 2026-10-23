import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import type { CallbackArgs } from '~/modules/common/data-table/types';
import { Step, Stepper } from '~/modules/common/stepper/stepper';
import { InvitationsStep } from '~/modules/home/onboarding/invitations-step';
import { getOnboardingSteps } from '~/modules/home/onboarding/onboarding-steps';
import { SkipStepButton } from '~/modules/home/onboarding/skip-step-button';
import { WelcomeText } from '~/modules/home/onboarding/welcome-text';
import { meInvitationsQueryOptions } from '~/modules/me/query';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { InviteUsers } from '~/modules/user/invite-users';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

export type OnboardingState = 'start' | 'stepper' | 'completed';

interface OnboardingProps {
  state: OnboardingState;
  onStart: () => void;
  onComplete: () => void;
}

export function Onboarding({ state, onStart, onComplete }: OnboardingProps) {
  const user = useCurrentUser();
  const { t } = useTranslation();

  const [organization, setOrganization] = useState<Organization | null>(null);

  const orgQuery = useInfiniteQuery(organizationsListQueryOptions({ relatableUserId: user.id }));
  const organizations = flattenInfiniteData<Organization>(orgQuery.data);
  const { data: invitationsData } = useQuery(meInvitationsQueryOptions());
  const invitations = invitationsData?.items ?? [];

  // Locked at mount so answering an invitation or creating an org mid-flow does not reshape the stepper. The welcome
  // route loads both queries first, so the lock sees real data.
  const [steps] = useState(() => getOnboardingSteps({ hasOrganizations: organizations.length > 0, hasInvitations: invitations.length > 0 }));

  const skipButton = <SkipStepButton onComplete={onComplete} />;

  return (
    <div className="flex min-h-[90svh] flex-col items-center sm:min-h-svh">
      <div className="my-auto w-full">
        {state === 'start' && <WelcomeText invitations={invitations} onStart={onStart} />}
        {state === 'stepper' && (
          <div className="mx-auto flex max-w-3xl starting:translate-y-4 starting:scale-95 flex-col gap-4 px-4 py-8 starting:opacity-0 transition-[opacity,translate,scale] duration-500 ease-out sm:w-10/12">
            {steps.length === 1 && <h2 className="flex justify-center font-semibold text-lg">{steps[0].label}</h2>}
            <Stepper
              steps={steps}
              onClickStep={(newStep, setStep) => {
                setStep(newStep);
              }}
            >
              {steps.map(({ description, label, id }) => (
                <Step key={id} label={label} checkIcon={id === 'organization' && !organization ? XIcon : undefined}>
                  <Card>
                    {description && (
                      <CardHeader>
                        <CardDescription>{description}</CardDescription>
                      </CardHeader>
                    )}
                    <CardContent>
                      {id === 'invitations' && <InvitationsStep>{skipButton}</InvitationsStep>}
                      {id === 'profile' && (
                        <UpdateUserForm user={user} compact>
                          {skipButton}
                        </UpdateUserForm>
                      )}
                      {id === 'organization' && !organization && (
                        <CreateOrganizationForm
                          callback={(args: CallbackArgs<Organization>) => {
                            if (args.status === 'success') setOrganization(args.data);
                          }}
                        >
                          {skipButton}
                        </CreateOrganizationForm>
                      )}
                      {id === 'organization' && !!organization && <p className="text-muted-foreground text-sm">{t('c:already_created_org.text')}</p>}
                      {id === 'invitation' && organization && (
                        <InviteUsers channel={organization} mode="email">
                          {skipButton}
                        </InviteUsers>
                      )}
                      {id === 'invitation' && !organization && (
                        <div>
                          <p className="mb-4 text-muted-foreground text-sm">{t('c:need_org_to_invite.text')}</p>
                          {skipButton}
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
