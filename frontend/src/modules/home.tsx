import { SimpleHeader } from '~/modules/common/simple-header';
import Onboarding from './onboarding';
import { useState } from 'react';
import { Button } from '~/modules/ui/button';
import { config } from 'config';

const Home = () => {
  const [isOnboarding, setOnboarding] = useState(false);

  return (
    <>
      {isOnboarding && <Onboarding />}
      <SimpleHeader heading="Home" text="Explain page here" />
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center">This is the home component</div>

        {config.has.onboarding && (<div>
          <Button onClick={() => setOnboarding(true)}>Show Onboarding WIP</Button>
        </div>)}
      </div>
    </>
  );
};

export default Home;
