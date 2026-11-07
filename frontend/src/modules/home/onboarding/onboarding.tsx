import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import i18n from 'i18next';
import { XIcon } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from 'sdk';
import { EntityAvatar } from '~/modules/common/entity-avatar';
import { NamedText } from '~/modules/common/named-text';
import { Step, Stepper } from '~/modules/common/stepper/stepper';
import type { StepItem } from '~/modules/common/stepper/types';
import { useStepper } from '~/modules/common/stepper/use-stepper';
import { SkipStepButton } from '~/modules/home/onboarding/skip-step-button';
import { WelcomeText } from '~/modules/home/onboarding/welcome-text';
import { meInvitationsQueryOptions, useHandleInvitationMutation } from '~/modules/me/query';
import { CreateOrganizationForm } from '~/modules/organization/create-organization-form';
import { organizationsListQueryOptions } from '~/modules/organization/query';
import { Button } from '~/modules/ui/button';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';
import { InviteUsers } from '~/modules/user/invite-users';
import { UpdateUserForm } from '~/modules/user/update-user-form';
import { useCurrentUser } from '~/modules/user/user-store';
import { flattenInfiniteData } from '~/query/basic/flatten';

export type OnboardingState = 'start' | 'stepper' | 'completed';

interface OnboardingContext {
  hasOrganizations: boolean;
  hasInvitations: boolean;
}

interface OnboardingStep extends StepItem {
  when: (ctx: OnboardingContext) => boolean;
}

/** Someone with no organization and no invitation waiting: the one who sets up an organization for others. */
const isFounder = ({ hasOrganizations, hasInvitations }: OnboardingContext) => !hasOrganizations && !hasInvitations;

/** The steps that fit this user; call it at render time, since `i18n.t` returns undefined until i18next has loaded its namespaces. */
function getOnboardingSteps(ctx: OnboardingContext): StepItem[] {
  const steps: OnboardingStep[] = [
    { id: 'invitations', label: i18n.t('c:pending_invitations'), optional: true, when: ({ hasInvitations }) => hasInvitations },
    { id: 'profile', label: i18n.t('c:tune_profile'), optional: true, when: () => true },
    { id: 'organization', label: i18n.t('c:create_resource', { resource: i18n.t('c:organization') }), optional: true, when: isFounder },
    { id: 'invitation', label: i18n.t('c:invite_others'), optional: true, when: isFounder },
  ];

  return steps.filter(({ when }) => when(ctx)).map(({ when: _when, ...step }) => step);
}

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
  const invitations = invitationsData?.results ?? [];

  // Locked at mount, after the welcome route has loaded both queries: an answer or a new organization mid-flow keeps the steps.
  const [steps] = useState(() => getOnboardingSteps({ hasOrganizations: organizations.length > 0, hasInvitations: invitations.length > 0 }));

  const skipButton = <SkipStepButton onComplete={onComplete} />;

  return (
    <div className="flex min-h-[90svh] flex-col items-center sm:min-h-svh">
      <div className="my-auto w-full">
        {state === 'start' && <WelcomeText invitations={invitations} organizations={organizations} onStart={onStart} />}
        {state === 'stepper' && (
          <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-8 transition-[opacity,translate,scale] duration-500 ease-out sm:w-10/12 starting:translate-y-4 starting:scale-95 starting:opacity-0">
            {steps.length === 1 && <h2 className="flex justify-center text-lg font-semibold">{steps[0].label}</h2>}
            <Stepper steps={steps} onClickStep={(step, setStep) => setStep(step)} onComplete={onComplete}>
              {steps.map(({ description: stepDescription, label, id }) => {
                // The steps are locked before the organization exists, so the invitation step names it once it does
                const description =
                  id === 'invitation' && organization ? <NamedText i18nKey="c:invite_members.text" name={organization.name} /> : stepDescription;
                return (
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
                            onboarding
                            callback={(args) => {
                              if (args.status === 'success') setOrganization(args.data);
                            }}
                          >
                            {skipButton}
                          </CreateOrganizationForm>
                        )}
                        {id === 'organization' && organization && <p className="text-muted-foreground text-sm">{t('c:already_created_org.text')}</p>}
                        {id === 'invitation' && organization && (
                          <InviteUsers channel={organization} mode="email">
                            {skipButton}
                          </InviteUsers>
                        )}
                        {id === 'invitation' && !organization && (
                          <div>
                            <p className="text-muted-foreground mb-4 text-sm">{t('c:need_org_to_invite.text')}</p>
                            {skipButton}
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </Step>
                );
              })}
            </Stepper>
          </div>
        )}
      </div>
    </div>
  );
}

interface InvitationsStepProps {
  children?: ReactNode;
}

/** Answers each pending invitation by an explicit click (one claimed by address was never opened by this user); moves on after the last. */
function InvitationsStep({ children }: InvitationsStepProps) {
  const { t } = useTranslation();
  const { nextStep } = useStepper();

  const { data } = useQuery(meInvitationsQueryOptions());
  const invitations = data?.results ?? [];

  const { mutate: handleInvitation, isPending } = useHandleInvitationMutation();

  // Only an answer given here moves on; revisiting the step with nothing left stays put.
  const previousCountRef = useRef(invitations.length);
  useEffect(() => {
    if (previousCountRef.current > 0 && invitations.length === 0) nextStep();
    previousCountRef.current = invitations.length;
  }, [invitations.length]);

  const answer = (invitationId: string, action: 'accept' | 'reject') => handleInvitation({ invitationId, action });

  return (
    <div className="flex flex-col gap-4">
      {invitations.length === 0 && <p className="text-muted-foreground text-sm">{t('c:no_invitations_left.text')}</p>}

      <ul className="flex flex-col gap-3">
        {invitations.map(({ entity, inactiveMembership }) => (
          <li key={inactiveMembership.id} className="flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
            <div className="flex min-w-0 grow items-center gap-3">
              <EntityAvatar type={entity.entityType} className="size-10 shrink-0" id={entity.id} name={entity.name} url={entity.thumbnailUrl} />
              <p className="min-w-0 text-sm">
                {t('c:invite_accept_as_account.text', {
                  inviterName: inactiveMembership.createdBy?.name ?? t('c:unknown'),
                  entityName: entity.name,
                  role: t(`c:${inactiveMembership.role}`),
                })}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button
                size="sm"
                variant="success"
                className="max-sm:w-full"
                disabled={isPending}
                onClick={() => answer(inactiveMembership.id, 'accept')}
              >
                {t('c:accept')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                className="max-sm:w-full"
                disabled={isPending}
                onClick={() => answer(inactiveMembership.id, 'reject')}
              >
                {t('c:decline')}
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {children}
    </div>
  );
}
