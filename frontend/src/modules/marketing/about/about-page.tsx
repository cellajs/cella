import { ArrowDownIcon, CheckIcon, CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { CallToAction } from '~/modules/marketing/about/call-to-action';
// import { Counters } from '~/modules/marketing/about/counters';
// import { FAQ } from '~/modules/marketing/about/faq';
import { Hero } from '~/modules/marketing/about/hero';
import { InfoCards } from '~/modules/marketing/about/info-cards';
// import { Pricing } from '~/modules/marketing/about/pricing';
import { Showcase } from '~/modules/marketing/about/showcase';
import '~/modules/marketing/about/glow-button.css';
import { AboutSection } from '~/modules/marketing/about/section';
import { Why } from '~/modules/marketing/about/why';
import { MarketingFooter } from '~/modules/marketing/footer';
import { GithubIcon } from '~/modules/marketing/icons/github';
import { InfoGrid } from '~/modules/marketing/info-grid';
import { stackItems } from '~/modules/marketing/marketing-config';
import { MarketingNav } from '~/modules/marketing/nav';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

export type AboutSectionId = (typeof aboutSectionIds)[number];

const aboutSectionIds = ['hero', 'benefits', 'showcase', 'template', 'stack', 'integrations', 'call-to-action'];

function AboutPage() {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();

  useScrollSpy(aboutSectionIds);

  return (
    <>
      <MarketingNav />

      <div className="container max-w-none px-0">
        {/* Hero landing */}
        <Hero
          key={'hero'}
          title="about:hero.title"
          // chips={['about:chip.mit_licensed', 'about:chip.batteries_included', 'about:chip.european_infra']}
          text="about:hero.text"
        >
          <div className="mb-8 flex xs:flex-row flex-col items-center gap-4">
            <Button
              variant="plain"
              size="lg"
              onClick={() => window.open(appConfig.company.githubUrl, '_blank', 'noopener')}
              className="group h-14 rounded-full! px-8 transition"
              aria-label={t('about:github_star')}
            >
              <GithubIcon className="mr-2 size-4 transition-transform group-hover:scale-110" />
              {t('about:github_star')}
            </Button>
            <div className="glow-button relative max-sm:hidden">
              <Input
                readOnly
                value="pnpm create @cellajs/cella"
                className="block h-14 w-80 rounded-full border border-transparent bg-background px-8 py-6 font-light font-mono text-sm ring-4 ring-primary/10 transition focus:border-gray-500 focus:outline-hidden focus-visible:ring-primary/20 sm:w-96"
              />
              {copied && (
                <div className="absolute top-2.5 right-2 left-8 rounded-full bg-background py-2 text-left font-mono text-sm">
                  copied! bon voyage 🚀
                </div>
              )}

              <Button
                onClick={() => copyToClipboard('pnpm create @cellajs/cella')}
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 rounded-full"
              >
                {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
              </Button>
            </div>
          </div>
          <Button
            variant="ghost"
            size="lg"
            className="group max-sm:hidden"
            onClick={() => scrollToSectionById('benefits')}
            aria-label="Read more"
          >
            <span className="font-normal text-base opacity-70 group-hover:opacity-100">
              {t('about:continue_below_fold')}
            </span>
            <ArrowDownIcon size={16} className="ml-2 animate-bounce opacity-70 group-hover:opacity-100" />
          </Button>
        </Hero>

        {/* Core features / benefits */}
        <AboutSection key={'benefits'} sectionId="benefits" title="about:features.title">
          <Why />
        </AboutSection>

        {/* Stack */}
        <AboutSection
          key={'stack'}
          sectionId="stack"
          title="about:stack.title"
          text="about:stack.text"
          alternate={true}
        >
          <InfoGrid namespace="stack" items={stackItems} image expandable tileClassName="bg-background" />
        </AboutSection>

        {/* Integrations */}
        <AboutSection
          key={'integrations'}
          sectionId="integrations"
          title="about:integrations.title"
          text="about:integrations.text"
        >
          <InfoCards />
        </AboutSection>

        {/* Showcase */}
        <AboutSection
          key={'showcase'}
          sectionId="showcase"
          title="about:showcase.title"
          text="about:showcase.text"
          alternate
        >
          <Showcase />
        </AboutSection>

        {/* Call to Action */}
        <AboutSection key={'call-to-action'} sectionId="call-to-action">
          <CallToAction />
        </AboutSection>

        {/* Public counters */}
        {/* <AboutSection
            key={'counters'}
            sectionId="counters"
            title="about:community.title"
            text="about:community.text"
            alternate={true}
          >
            <Counters />
          </AboutSection> */}

        {/* Pricing */}
        {/* <AboutSection key={'pricing'} sectionId="pricing" title="about:pricing.title" text="about:pricing.text">
            <Pricing />
          </AboutSection> */}

        {/* FAQs */}
        {/* <AboutSection key={'faqs'} sectionId="faqs" title="about:faq.title" text="about:faq.text" alternate={true}>
            <FAQ />
          </AboutSection> */}
      </div>
      <MarketingFooter />
    </>
  );
}

export default AboutPage;
