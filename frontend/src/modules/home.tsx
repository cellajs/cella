import { SimpleHeader } from '~/modules/common/simple-header';
// import Onboarding from './onboarding';

const Home = () => {
  return (
    <>
      {/* <Onboarding /> */}
      <SimpleHeader heading="Home" text="Explain page here" />
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center">This is the home component</div>
      </div>
    </>
  );
};

export default Home;
