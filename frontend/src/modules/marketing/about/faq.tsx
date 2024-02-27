import { useTranslation } from 'react-i18next';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';

interface FaqItem {
  id: string;
}

const faqsData: FaqItem[] = [{ id: 'production-ready' }, { id: 'cella-vs-next' }, { id: 'alternative-to-nextjs' }, { id: 'cella-made-in-europe' }];

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
                <span className="text-lg font-light">{t(answer)}</span>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
};

export default FAQ;
