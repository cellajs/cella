import type { CreateOrganizationParams } from '~/api/organizations';
import { Button } from '../ui/button';
import { useStepper } from '../ui/stepper';
import type { UseFormReturn } from 'react-hook-form';

interface Props {
  createOrganizationForm: UseFormReturn<CreateOrganizationParams> | null;
}

const Footer = ({ createOrganizationForm }: Props) => {
  const { currentStep, nextStep, prevStep, hasCompletedAllSteps, isOptionalStep } = useStepper();

  if (hasCompletedAllSteps) {
    return (
      <div className="h-40 flex items-center justify-center my-4 border bg-secondary text-primary rounded-md">
        <h1 className="text-xl">Woohoo! All steps completed! 🎉</h1>
      </div>
    );
  }

  console.log('createOrganizationForm', createOrganizationForm);

  return (
    <div className="w-full flex justify-end gap-2">
      {currentStep.id === 'step-1' ? (
        <Button size="sm" onClick={nextStep}>
          {(Object.keys(createOrganizationForm?.formState || {}).length > 0) ? 'Next' : 'Skip'}
        </Button>
      ) : ['step-2', 'step-3', 'step-4'].includes(currentStep.id || '') ? (
        <div className="w-full flex justify-end gap-2">
          <Button onClick={prevStep} size="sm" variant="secondary">
            Prev
          </Button>
          <Button size="sm" onClick={nextStep}>
            {isOptionalStep ? 'Skip' : 'Next'}
          </Button>
        </div>
      ) : (
        <></>
      )}
    </div>
  );

  // return (
  //   <>
  //     {hasCompletedAllSteps && (
  //       <div className="h-40 flex items-center justify-center my-4 border bg-secondary text-primary rounded-md">
  //         <h1 className="text-xl">Woohoo! All steps completed! 🎉</h1>
  //       </div>
  //     )}
  //     <div className="w-full flex justify-end gap-2">
  //       {hasCompletedAllSteps ? (
  //         <Button size="sm" onClick={resetSteps}>
  //           Reset
  //         </Button>
  //       ) : (
  //         <>
  //           <Button disabled={isDisabledStep} onClick={prevStep} size="sm" variant="secondary">
  //             Prev
  //           </Button>
  //           <Button size="sm" onClick={nextStep}>
  //             {isLastStep ? 'Finish' : isOptionalStep ? 'Skip' : 'Next'}
  //           </Button>
  //         </>
  //       )}
  //     </div>
  //   </>
  // );
};

export default Footer;
