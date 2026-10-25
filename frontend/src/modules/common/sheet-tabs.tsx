import { motion } from 'motion/react';
import { type ReactNode, Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';
import { Button } from '~/modules/ui/button';

export type SheetTab = { id: string; label: TKey; element: ReactNode };

interface SheetTabsProps {
  tabs: SheetTab[];
}

export function SheetTabs({ tabs }: SheetTabsProps) {
  // Stable per instance, so the underline animates between tabs
  const layoutId = useId();
  const { t } = useTranslation();

  // The id, so a sheet update that passes new tabs shows their element
  const [currentId, setCurrentId] = useState(tabs[0].id);
  const currentTab = tabs.find((tab) => tab.id === currentId) ?? tabs[0];

  return (
    <div className="mb-20">
      {tabs.length > 1 && (
        <nav className="flex justify-center gap-2 pb-4">
          {tabs.map((tab) => (
            <Button
              key={tab.id}
              variant="none"
              press={false}
              data-current={currentTab.id === tab.id}
              className="group/sheet-tab relative select-none opacity-80 hover:opacity-100 data-[current=true]:opacity-100"
              onClick={() => setCurrentId(tab.id)}
            >
              <span className="group-active/sheet-tab:press block">{t(tab.label)}</span>
              {currentTab.id === tab.id && (
                <motion.span
                  initial={false}
                  layoutId={layoutId}
                  transition={{ type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 }}
                  className="absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm bg-primary"
                />
              )}
            </Button>
          ))}
        </nav>
      )}
      <div className="container">
        <Suspense>{currentTab.element}</Suspense>
      </div>
    </div>
  );
}
