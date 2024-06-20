import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../ui/button';

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
    <div>
      <nav className="inline-flex gap-2 w-full my-2 align-center justify-center">
        {tabs.map((tab) => (
          <div key={tab.id} className="relative">
            <Button
              variant="none"
              className={`text-lg hover:opacity-100 ${currentPage.id === tab.id ? 'opacity-100' : 'opacity-80'}`}
              onClick={() => setCurrentPage(tab)}
            >
              {t(tab.label)}
            </Button>
            {currentPage.id === tab.id && <div className="h-1 bg-primary w-full absolute bottom-0 left-0" />}
          </div>
        ))}
      </nav>
      <div>{renderPage()}</div>
    </div>
  );
};
