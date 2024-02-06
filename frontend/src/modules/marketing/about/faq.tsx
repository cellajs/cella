import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '~/modules/ui/accordion';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const faqsData: FaqItem[] = [
  {
    id: 'production-ready',
    question: 'Is Cella ready for production?',
    answer:
      'Soon! It has been made public to gather input and feedback from the community. Big changes will still occur. Please help us by trying it out and giving feedback.',
  },
  {
    id: 'cella-vs-next',
    question: "Why doesn't Cella use NextJS?",
    answer:
      "One core concept is: remain close to libraries & resist applying abstraction layers. We believe this ultimately makes your code easier to read, understand, customize, replace and scale. A React framework doesn't fit in this concept.",
  },
  {
    id: 'alternative-to-nextjs',
    question: 'Is Cella an alternative to NextJS?',
    answer:
      'You pick NextJS if you want to make many architectural decisions yourself. You pick Cella if you consider less architectural freedom a good tradeoff to save enormous amounts of development time. Oh, and pick Cella if you simply like the beautiful stack we chose :D.',
  },
  {
    id: 'cella-made-in-europe',
    question: 'What\'s the deal with "Made in Europe"?',
    answer:
      'Our decision to focus - for tool integrations in particular - on Europe is not meant to exclude another region. We simply believe in Europe and want to make it more independent. A healthy power balance benefits not just Europe but the entire global (open source) community.',
  },
];

const FAQ = () => {
  return (
    <div className="mx-auto max-w-[48rem]">
      <Accordion type="single" className="w-full" collapsible>
        {faqsData.map((faq) => (
          <AccordionItem key={faq.id} value={faq.id}>
            <AccordionTrigger>
              <span className="text-lg">{faq.question}</span>
            </AccordionTrigger>
            <AccordionContent>
              <span className="text-lg font-light">{faq.answer}</span>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
};

export default FAQ;
