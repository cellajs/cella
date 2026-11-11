import { motion } from 'motion/react';
import { type ReactNode, Suspense, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TKey } from '~/lib/i18n-locales';

export type SheetTab = { id: string; label: TKey; element: ReactNode };

// The underline glides to the pressed tab once that tab's content has started to render
const glideTransition = { type: 'spring', duration: 0.4, bounce: 0, delay: 0.1 } as const;

export function SheetTabs({ tabs }: { tabs: SheetTab[] }) {
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
              className="group/sheet-tab focus-effect text-muted-foreground hover:text-foreground data-[current=true]:text-foreground relative inline-flex h-10 items-center rounded-md px-3 py-2 text-sm font-medium whitespace-nowrap transition-colors select-none"
              onClick={() => setCurrentId(tab.id)}
            >
              <span className="group-active/sheet-tab:press block">{t(tab.label)}</span>
              {currentTab.id === tab.id && (
                <motion.span
                  initial={false}
                  layoutId={layoutId}
                  transition={glideTransition}
                  className="bg-primary absolute bottom-0 left-2 h-1 w-[calc(100%-1rem)] rounded-sm"
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
