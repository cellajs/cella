import { motion } from 'framer-motion';
import { Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { nanoid } from '~/utils/nanoid';

interface Props {
  tabs: { id: string; label: string; element: React.ReactNode }[];
}

export const SheetNav = ({ tabs }: Props) => {
  const { t } = useTranslation();
  const [currentPage, setCurrentPage] = useState(tabs[0]);

  const renderPage = () => {
    return currentPage.element;
  };

  return (
    <div className="mb-20">
      {tabs.length > 1 && (
        <nav className="flex gap-2 pb-4">
          {tabs.map((tab) => (
            <div key={tab.id} className="relative">
              <Button
                variant="none"
                className={`hover:opacity-100 ${currentPage.id === tab.id ? 'opacity-100' : 'opacity-80'}`}
                onClick={() => setCurrentPage(tab)}
              >
                {t(tab.label)}
              </Button>
              {currentPage.id === tab.id && (
                <motion.div
                  key={nanoid()}
                  transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                  className="h-1 bg-primary w-full rounded-sm absolute bottom-0 left-0"
                />
              )}
            </div>
          ))}
        </nav>
      )}
      <Suspense>{renderPage()}</Suspense>
    </div>
  );
};
