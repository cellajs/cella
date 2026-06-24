import { Link } from '@tanstack/react-router';
import { ArrowDownIcon, CheckIcon, CopyIcon, RedoIcon } from 'lucide-react';
import { Trans, useTranslation } from 'react-i18next';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { scrollToSectionById } from '~/hooks/use-scroll-spy-store';
import { CallToAction } from '~/modules/marketing/about/call-to-action';
// import { Counters } from '~/modules/marketing/about/counters';
// import { FAQ } from '~/modules/marketing/about/faq';
import { Hero } from '~/modules/marketing/about/hero';
import { InfoCards } from '~/modules/marketing/about/info-cards';
import { InfoGrid } from '~/modules/marketing/about/info-grid';
// import { Pricing } from '~/modules/marketing/about/pricing';
import { Showcase } from '~/modules/marketing/about/showcase';
import '~/modules/marketing/about/glow-button.css';
import { AboutSection } from '~/modules/marketing/about/section';
import { SyncDiagram } from '~/modules/marketing/about/sync-diagram';
import { Why } from '~/modules/marketing/about/why';
import { MarketingFooter } from '~/modules/marketing/footer';
import { MarketingNav } from '~/modules/marketing/nav';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

export type AboutSectionId = (typeof aboutSectionIds)[number];

const aboutSectionIds = ['hero', 'why', 'features', 'integrations', 'showcase', 'call-to-action'];

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
          chips={['about:chip.mit_licensed', 'about:chip.batteries_included', 'about:chip.european_infra']}
          text="about:hero.text"
        >
          <div className="glow-button relative mb-8 max-xs:hidden">
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
          <Button
            variant="ghost"
            size="lg"
            className="group"
            onClick={() => scrollToSectionById('why')}
            aria-label="Read more"
          >
            <span className="font-normal opacity-70 group-hover:opacity-100">{t('about:why')}</span>
            <ArrowDownIcon size={16} className="ml-2 animate-bounce opacity-70 group-hover:opacity-100" />
          </Button>
        </Hero>

        <div className="my-12">
          {/* Why cella */}
          <AboutSection
            key={'why'}
            sectionId="why"
            title="about:title_2"
            text="about:text_2"
            textComponents={{ em: <em className="italic" /> }}
          >
            <p className="mx-auto mb-12 max-w-3xl text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
              <Trans
                t={t}
                i18nKey="about:cella_approach"
                components={{
                  strong: <strong className="font-semibold text-foreground" />,
                }}
              />
            </p>
            <p className="mx-auto mb-12 max-w-3xl text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">
              <Trans
                t={t}
                i18nKey="about:cella_approach2"
                components={{
                  em: <em className="italic" />,
                  strong: <strong className="font-semibold text-foreground" />,
                }}
              />
            </p>

            <SyncDiagram />

            <p className="mx-auto max-w-2xl font-light">
              <Trans
                t={t}
                i18nKey="about:sync_flow"
                components={{
                  strong: <strong className="font-semibold text-foreground" />,
                }}
              />
            </p>
          </AboutSection>

          {/* Why template */}
          <AboutSection
            key={'template'}
            sectionId="template"
            title="about:how_it_works"
            text="about:how_it_works.text"
            alternate
          >
            <p className="mx-auto mt-8 max-w-lg font-light italic opacity-70">{t('about:compare_intro')}</p>

            <div className="relative mx-auto mt-8 w-full max-w-lg">
              <RedoIcon
                className="absolute -left-20 size-20 -translate-y-1/2 text-primary max-md:hidden"
                strokeWidth={0.2}
                style={{ transform: 'rotate(-150deg) skewX(-50deg) scaleX(-2.5) scaleY(2.5)' }}
              />
            </div>

            <Button variant="plain" size="xl" className="mx-auto mt-8 flex gap-1 rounded-full! px-10">
              {t('about:compare_alternatives')}
            </Button>
          </AboutSection>

          {/* Core features */}
          <AboutSection
            key={'benefits'}
            sectionId="benefits"
            title="about:benefits"
            text="about:features_subtext"
            textComponents={{
              featuresLink: <Link to="/features" className="underline underline-offset-4 hover:text-primary" />,
            }}
          >
            <Why />
          </AboutSection>

          {/* Stack */}
          <AboutSection key={'stack'} sectionId="stack" title="about:title_3" text="about:text_3" alternate={true}>
            <InfoGrid namespace="stack" />
          </AboutSection>

          {/* Integrations */}
          <AboutSection key={'integrations'} sectionId="integrations" title="about:title_4" text="about:text_4">
            <InfoCards />
          </AboutSection>

          {/* Showcase */}
          <AboutSection key={'showcase'} sectionId="showcase" title="about:showcase" text="about:showcase.text">
            <Showcase />
          </AboutSection>

          {/* Call to Action */}
          <AboutSection key={'call-to-action'} sectionId="call-to-action" alternate={true}>
            <CallToAction />
          </AboutSection>

          {/* Public counters */}
          {/* <AboutSection key={'counters'} sectionId="counters" title="about:title_5" text="about:text_5" alternate={true}>
            <Counters />
          </AboutSection> */}

          {/* Pricing */}
          {/* <AboutSection key={'pricing'} sectionId="pricing" title="about:title_6" text="about:text_6">
            <Pricing />
          </AboutSection> */}

          {/* FAQs */}
          {/* <AboutSection key={'faqs'} sectionId="faqs" title="about:title_7" text="about:text_7" alternate={true}>
            <FAQ />
          </AboutSection> */}
        </div>
      </div>
      <MarketingFooter />
    </>
  );
}

export default AboutPage;
