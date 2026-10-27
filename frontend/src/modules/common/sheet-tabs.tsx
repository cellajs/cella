import { motion } from 'motion/react';
import { type ReactNode, Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';

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
            <button
              key={tab.id}
              type="button"
              data-current={currentTab.id === tab.id}
              className="group/sheet-tab focus-effect relative inline-flex h-10 select-none items-center whitespace-nowrap rounded-md px-3 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground data-[current=true]:text-foreground"
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
            </button>
          ))}
        </nav>
      )}
      <div className="container">
        <Suspense>{currentTab.element}</Suspense>
      </div>
    </div>
  );
}
