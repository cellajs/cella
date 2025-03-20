import { useTranslation } from 'react-i18next';
import type { AboutSectionId } from './about-page';

interface AboutSectionProps {
  section: AboutSectionId;
  title?: string;
  text?: string;
  children?: React.ReactNode;
  alternate?: boolean; // Optional prop for background styling
}

export const AboutSection = ({ title, text, section, children, alternate = false }: AboutSectionProps) => {
  const { t } = useTranslation();

  const backgroundClass = alternate ? 'bg-accent/40 dark:bg-transparent' : '';

  return (
    <section id={section} className={`container overflow-hidden max-w-none py-8 px-4 md:py-12 lg:py-24 ${backgroundClass}`}>
      <div className="mx-auto mb-12 flex max-w-[48rem] flex-col justify-center gap-4">
        {title && <h2 className="font-heading text-3xl font-semibold leading-[1.1] sm:text-center md:text-4xl">{t(title)}</h2>}
        {text && <p className="text-muted-foreground leading-normal sm:text-center sm:text-lg sm:leading-7">{t(text)}</p>}
      </div>
      {children}
    </section>
  );
};
