import { ArrowDownIcon, CopyIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { scrollToSectionById } from '~/hooks/scroll-spy-store';
import { useCopyToClipboard } from '~/hooks/use-copy-to-clipboard';
import { useScrollSpy } from '~/hooks/use-scroll-spy';
import { CopiedIcon } from '~/modules/common/copied-icon';
import { GithubIcon } from '~/modules/common/icons/github';
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
import { InfoGrid } from '~/modules/marketing/info-grid';
import { stackItems } from '~/modules/marketing/marketing-config';
import { MarketingNav } from '~/modules/marketing/nav';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';

const aboutSectionIds = ['welcome', 'benefits', 'stack', 'integrations', 'showcase', 'call-to-action'];

const installCommand = 'pnpm create @cellajs/cella';

export function AboutPage() {
  const { t } = useTranslation();

  const { copyToClipboard, copied } = useCopyToClipboard();

  useScrollSpy(aboutSectionIds);

  return (
    <>
      <MarketingNav />

      <main>
        <Hero
          title="about:hero.title"
          // chips={['about:chip.mit_licensed', 'about:chip.batteries_included', 'about:chip.european_infra']}
          text="about:hero.text"
        >
          <div className="mb-8 flex xs:flex-row flex-col items-center gap-4">
            <Button
              variant="plain"
              size="lg"
              render={<a href={appConfig.company.githubUrl} target="_blank" rel="noreferrer" />}
              className="group h-14 rounded-full px-8 transition"
            >
              <GithubIcon className="size-4 transition-transform group-hover:scale-110" />
              {t('about:github_star')}
            </Button>
            <div className="glow-button relative max-sm:hidden">
              <Input
                readOnly
                aria-label={t('c:install_command')}
                value={installCommand}
                className="block h-14 w-80 rounded-full border border-transparent bg-background px-8 py-6 font-light font-mono text-sm ring-4 ring-primary/10 transition focus:border-gray-500 focus:outline-hidden focus-visible:ring-primary/20 sm:w-96"
              />
              {copied && (
                <div className="absolute top-2.5 right-2 left-8 rounded-full bg-background py-2 text-left font-mono text-sm">
                  {t('about:install_copied')}
                </div>
              )}

              <Button
                onClick={() => copyToClipboard(installCommand)}
                aria-label={t('c:copy')}
                size="icon"
                variant="ghost"
                className="absolute top-2 right-2 rounded-full"
              >
                <CopiedIcon copied={copied} icon={CopyIcon} />
              </Button>
            </div>
          </div>
          <Button variant="ghost" size="lg" className="group max-sm:hidden" onClick={() => scrollToSectionById('benefits')}>
            <span className="font-normal text-base opacity-70 group-hover:opacity-100">{t('about:continue_below_fold')}</span>
            <ArrowDownIcon className="repeat-5 animate-bounce opacity-70 group-hover:opacity-100 motion-reduce:animate-none" />
          </Button>
        </Hero>

        <AboutSection sectionId="benefits" title="about:features.title">
          <Why />
        </AboutSection>

        <AboutSection sectionId="stack" title="about:stack.title" text="about:stack.text" alternate>
          <InfoGrid namespace="stack" items={stackItems} image expandable tileClassName="bg-background" />
        </AboutSection>

        <AboutSection sectionId="integrations" title="about:integrations.title" text="about:integrations.text">
          <InfoCards />
        </AboutSection>

        <AboutSection sectionId="showcase" title="about:showcase.title" text="about:showcase.text" alternate>
          <Showcase />
        </AboutSection>

        <AboutSection sectionId="call-to-action">
          <CallToAction />
        </AboutSection>

        {/* <AboutSection sectionId="counters" title="about:community.title" text="about:community.text" alternate>
            <Counters />
          </AboutSection> */}

        {/* <AboutSection sectionId="pricing" title="about:pricing.title" text="about:pricing.text">
            <Pricing />
          </AboutSection> */}

        {/* <AboutSection sectionId="faqs" title="about:faq.title" text="about:faq.text" alternate>
            <FAQ />
          </AboutSection> */}
      </main>
      <MarketingFooter />
    </>
  );
}
