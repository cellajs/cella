import { Link } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { faqsData } from '~/modules/marketing/about-config';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';

const FAQ = () => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-[48rem]">
      <Accordion type="single" className="w-full" collapsible>
        {faqsData.map((faq, index) => {
          const question = `about:faq.question_${index + 1}`;
          const answer = `about:faq.answer_${index + 1}`;

          return (
            <AccordionItem key={faq.id} value={faq.id}>
              <AccordionTrigger>
                <span className="text-lg">{t(question)}</span>
              </AccordionTrigger>
              <AccordionContent>
                <Trans
                  i18nKey={answer}
                  components={{
                    Link: <Link to={faq.link} aria-label={`Visit ${faq.link}`} target="_blank" className="underline" />,
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default FAQ;
