import { useState } from 'react';
import CreateOrganizationForm from '../organizations/create-organization-form';
import { Step, Stepper, type StepItem } from '../ui/stepper';
import Footer from './footer';
import type { CreateOrganizationParams } from '~/api/organizations';
import type { UseFormReturn } from 'react-hook-form';
import UpdateUserForm from '../users/update-user-form';
import type { UpdateUserParams } from '~/api/users';
import { useUserStore } from '~/store/user';
import InviteUsers from '../common/invite-users';

const steps = [
  {
    id: 'step-1',
    label: 'Step 1 Create organization',
    optional: true,
  },
  {
    id: 'step-2',
    label: 'Step 2 Your profile',
    optional: true,
  },
  {
    id: 'step-3',
    label: 'Step 3 Your team',
    optional: true,
  },
  {
    id: 'step-4',
    label: 'Step 4 Get started',
  },
] satisfies StepItem[];

const Onboarding = () => {
  const user = useUserStore((state) => state.user);
  const [createOrganizationForm, setCreateOrganizationForm] = useState<UseFormReturn<CreateOrganizationParams> | null>(null);
  const [_updateUserForm, setUpdateUserForm] = useState<UseFormReturn<UpdateUserParams> | null>(null);
  return (
    <div className="absolute z-50 inset-0 bg-background flex items-center justify-center">
      <div className="w-3/5">
        <Stepper initialStep={0} steps={steps} orientation="vertical">
          {steps.map(({ label, id }, index) => {
            if (id === 'step-1') {
              return (
                <Step key={label} label={label}>
                  <div className="flex flex-col items-center justify-center my-4 border bg-secondary text-primary rounded-md p-4">
                    <div>
                      <div className="mb-4">
                        <h1 className="text-xl">Welcome to Cella</h1>
                        <p className="text-sm">Let's get started by creating your organization.</p>
                      </div>
                      <div>
                        <CreateOrganizationForm
                          setForm={setCreateOrganizationForm}
                          withButtons={false}
                          withDraft={false}
                        />
                      </div>
                    </div>
                  </div>
                </Step>
              );
            }

            if (id === 'step-2') {
              return (
                <Step key={label} label={label}>
                  <div className="flex flex-col items-center justify-center my-4 border bg-secondary text-primary rounded-md p-4">
                    <div>
                      <div className="mb-4">
                        <h1 className="text-xl">Setup your profile</h1>
                      </div>
                      <div>
                        <UpdateUserForm
                          user={user}
                          setForm={setUpdateUserForm}
                          withButtons={false}
                          withDraft={false}
                        />
                      </div>
                    </div>
                  </div>
                </Step>
              );
            }

            if (id === 'step-3') {
              return (
                <Step key={label} label={label}>
                  <div className="flex flex-col items-center justify-center my-4 border bg-secondary text-primary rounded-md p-4">
                    <div>
                      <div className="mb-4">
                        <h1 className="text-xl">Invite your team</h1>
                      </div>
                      <div>
                        <InviteUsers />
                      </div>
                    </div>
                  </div>
                </Step>
              );
            }

            if (id === 'step-4') {
              return (
                <Step key={label} label={label}>
                  <div className="flex flex-col items-center justify-center my-4 border bg-secondary text-primary rounded-md p-4">
                    <div>
                      <div className="mb-4">
                        <h1 className="text-xl">Get started</h1>
                      </div>
                      <div>
                      </div>
                    </div>
                  </div>
                </Step>
              );
            }

            return (
              <Step key={label} label={label}>
                <div className="h-40 flex items-center justify-center my-4 border bg-secondary text-primary rounded-md">
                  <h1 className="text-xl">Step {index + 1}</h1>
                </div>
              </Step>
            );
          })}
          <Footer createOrganizationForm={createOrganizationForm} />
        </Stepper>
      </div>
    </div>
  );
};

export default Onboarding;
