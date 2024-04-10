import { useEffect, useMemo } from 'react';
import { type InviteProps, invite } from '~/api/general';
import { type CreateOrganizationParams, createOrganization } from '~/api/organizations';
import { type UpdateUserParams, updateUser } from '~/api/users';
import { useUserStore } from '~/store/user';
import { Button } from '../../ui/button';
import { useStepper } from '../../ui/stepper';
import { dialog } from '../dialoger/state';

interface Props {
  createOrganizationFormValues: CreateOrganizationParams | null;
  updateUserFormValues: UpdateUserParams | null;
  inviteFormValues: InviteProps | null;
  isDialog: boolean;
}

const Footer = ({ createOrganizationFormValues, updateUserFormValues, inviteFormValues, isDialog }: Props) => {
  const user = useUserStore((state) => state.user);
  const { currentStep, nextStep, prevStep, hasCompletedAllSteps, resetSteps, isLastStep } = useStepper();

  const buttonText = useMemo(() => {
    if (!currentStep) return 'Close';

    if (currentStep.id === 'step-1') {
      return createOrganizationFormValues ? 'Next' : 'Skip';
    }

    if (currentStep.id === 'step-2') {
      return updateUserFormValues ? 'Next' : 'Skip';
    }

    if (isLastStep) {
      return 'Finish';
    }

    return 'Next';
  }, [currentStep?.id, createOrganizationFormValues, updateUserFormValues, inviteFormValues]);

  const onCompleted = () => {
    if (isDialog) {
      dialog.remove();
    }
  };

  useEffect(() => {
    if (hasCompletedAllSteps) {
      if (createOrganizationFormValues) {
        createOrganization(createOrganizationFormValues).then((org) => {
          if (inviteFormValues) {
            invite({
              ...inviteFormValues,
              organizationIdentifier: org.id,
            });
          }
        });
      }
      if (updateUserFormValues) updateUser(user.id, updateUserFormValues);
    }
  }, [hasCompletedAllSteps]);

  if (hasCompletedAllSteps) {
    return (
      <>
        <div className="h-40 flex items-center justify-center my-4 border bg-secondary rounded-md">
          <h1 className="text-xl">Woohoo! All steps completed! 🎉</h1>
        </div>
        <div className="w-full flex justify-end gap-2">
          <Button size="sm" onClick={onCompleted}>
            {buttonText}
          </Button>
        </div>
      </>
    );
  }

  return (
    <div className="w-full flex justify-end gap-2">
      {hasCompletedAllSteps ? (
        <Button onClick={resetSteps} size="sm">
          Reset
        </Button>
      ) : (
        <>
          {currentStep.id !== 'step-1' && (
            <Button onClick={prevStep} size="sm" variant="secondary">
              Prev
            </Button>
          )}
          <Button size="sm" onClick={nextStep}>
            {buttonText}
          </Button>
        </>
      )}
    </div>
  );
};

export default Footer;
