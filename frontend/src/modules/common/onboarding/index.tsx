import { useEffect, useState } from 'react';
import type { CreateOrganizationParams } from '~/api/organizations';
import type { UpdateUserParams } from '~/api/users';
import { useUserStore } from '~/store/user';
import InviteUsers from '../invite-users';
import CreateOrganizationForm from '../../organizations/create-organization-form';
import { Step, Stepper, type StepItem } from '../../ui/stepper';
import UpdateUserForm from '../../users/update-user-form';
import Footer from './footer';
import useMountedState from '~/hooks/use-mounted';
import { cn } from '~/lib/utils';
import type { InviteProps } from '~/api/general';
import { Card, CardContent, CardDescription, CardHeader } from '~/modules/ui/card';

interface OnboardingProps {
  isDialog: boolean;
}

const Onboarding = ({ isDialog }: OnboardingProps) => {
  const { hasStarted } = useMountedState();
  const animateClass = `transition-all will-change-transform duration-500 ease-out ${hasStarted ? 'opacity-1' : 'opacity-0 scale-95 translate-y-4'}`;

  const user = useUserStore((state) => state.user);
  const [createOrganizationFormValues, setCreateOrganizationFormValues] = useState<CreateOrganizationParams | null>(null);
  const [updateUserFormValues, setUpdateUserFormValues] = useState<UpdateUserParams | null>(null);
  const [inviteFormValues, setInviteFormValues] = useState<InviteProps | null>(null);

  const [steps, setSteps] = useState<StepItem[]>([
    {
      id: 'step-1',
      label: 'Create organization',
      optional: true,
    },
    {
      id: 'step-2',
      label: 'Tune your profile',
      optional: true,
    },
  ]);

  // Add step 3 if organization is created
  useEffect(() => {
    const isAlreadyExistingStep = steps.find((step) => step.id === 'step-3');
    if (!createOrganizationFormValues) {
      if (isAlreadyExistingStep) {
        setSteps(steps.filter((step) => step.id !== 'step-3'));
      }
      return;
    }

    if (!isAlreadyExistingStep) {
      setSteps((prevSteps) => [
        ...prevSteps,
        {
          id: 'step-3',
          label: 'Invite team',
          optional: true,
        },
      ]);
    }
  }, [steps, createOrganizationFormValues]);

  return (
    <div className="flex flex-col min-h-[90vh] sm:min-h-screen items-center">
      <div className="mt-auto mb-auto w-full">
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
                        <CreateOrganizationForm
                          initValues={createOrganizationFormValues}
                          onValuesChange={setCreateOrganizationFormValues}
                          withButtons={false}
                          withDraft={false}
                        />
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
                        <CardDescription className="font-light">Hi {user.firstName}! This is you?</CardDescription>
                      </CardHeader>

                      <CardContent>
                        <UpdateUserForm
                          user={user}
                          hiddenFields={['email', 'bio']}
                          initValues={updateUserFormValues}
                          onValuesChange={setUpdateUserFormValues}
                          withButtons={false}
                          withDraft={false}
                        />
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
                        <CardDescription className="font-light">Invite your team members to Cella</CardDescription>
                      </CardHeader>

                      <CardContent>
                        <InviteUsers
                          type="organization"
                          onValuesChange={setInviteFormValues}
                          initValues={inviteFormValues}
                          withButtons={false}
                          withDraft={false}
                        />
                      </CardContent>
                    </Card>
                  </Step>
                );
              }

              return (
                <Step key={label} label={label}>
                  <Card>
                    <CardHeader>
                      <CardDescription className="font-light">Last step to explain how to actuall do something </CardDescription>
                    </CardHeader>

                    <CardContent>Content here</CardContent>
                  </Card>
                </Step>
              );
            })}
            <Footer
              createOrganizationFormValues={createOrganizationFormValues}
              updateUserFormValues={updateUserFormValues}
              inviteFormValues={inviteFormValues}
              isDialog={isDialog}
            />
          </Stepper>
        </div>
      </div>
    </div>
  );
};

export default Onboarding;
