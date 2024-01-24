import PublicPage from '~/components/public-page';

export const TermsText = () => {
  return <p>Put terms here</p>;
};

export const Terms = () => {
  return (
    <PublicPage title="Terms and Conditions">
      <section className="py-16 bg-background">
        <div className="mx-auto max-w-[48rem] font-light px-4 md:px-8 min-h-screen">
          <TermsText />
        </div>
      </section>
    </PublicPage>
  );
};
