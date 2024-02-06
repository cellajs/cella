import PublicPage from '~/modules/common/public-page';

export const PrivacyText = () => {
  return <p>Put privacy statement here</p>;
};

export const Privacy = () => {
  return (
    <PublicPage title="Privacy Policy">
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-[48rem] px-4 md:px-8 font-light min-h-screen">
          <PrivacyText />
        </div>
      </section>
    </PublicPage>
  );
};
