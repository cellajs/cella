import { motion } from 'motion/react';
import { Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { nanoid } from '~/utils/nanoid';

interface Props {
  tabs: { id: string; label: string; element: React.ReactNode }[];
}

export const SheetTabs = ({ tabs }: Props) => {
  const layoutId = useMemo(() => nanoid(), []);
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(tabs[0]);

  const renderPage = () => currentPage.element;

  return (
    <div className="mb-20">
      {tabs.length > 1 && (
        <nav className="flex justify-center gap-2 pb-4">
          {tabs.map((tab) => (
            <div key={tab.id} className="relative">
              <Button
                variant="none"
                data-current={currentPage.id === tab.id}
                className="peer hover:opacity-100 opacity-80 data-[current=true]:opacity-100"
                onClick={() => setCurrentPage(tab)}
              >
                {t(tab.label)}
                {currentPage.id === tab.id && (
                  <motion.span
                    initial={false}
                    layoutId={layoutId}
                    transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                    className="h-1 bg-primary rounded-sm w-[calc(100%-1rem)] absolute bottom-0 left-2"
                  />
                )}
              </Button>
            </div>
          ))}
        </nav>
      )}
      <Suspense>{renderPage()}</Suspense>
    </div>
  );
};
