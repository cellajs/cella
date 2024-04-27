import { config } from 'config';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTranslation } from 'frontend/node_modules/react-i18next';

const publicNavConfig = [
  { id: 'features', url: '/about', hash: 'features' },
  { id: 'pricing', url: '/about', hash: 'pricing' },
  { id: 'docs', url: `${config.backendUrl}/docs`, hash: '' },
];

const RenderNavItems = () => {
  const { t } = useTranslation();

  return (
    <>
      {publicNavConfig.map((item) => (
        <a href={item.url} key={item.id} className={cn(buttonVariants({ variant: 'ghost', size: 'lg' }))}>
          {t(item.id)}
        </a>
      ))}
    </>
  );
};

export default RenderNavItems;
