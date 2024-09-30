import { Paintbrush } from 'lucide-react';
import { useMemo } from 'react';
import { Button } from '~/modules/ui/button';
import { Input } from '~/modules/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '~/modules/ui/popover';
import { RadioGroup, RadioGroupItem } from '~/modules/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/modules/ui/tabs';
import { cn } from '~/utils/utils';

type PickerType = 'solid' | 'gradient' | 'image';

interface BackgroundPickerProps {
  background: string;
  setBackground: (background: string) => void;
  className?: string;
  showText?: boolean;
  options?: PickerType[];
}

export function BackgroundPicker({
  background,
  setBackground,
  showText,
  className,
  options = ['solid', 'gradient', 'image'],
}: BackgroundPickerProps) {
  const solids = ['#E2E2E2', '#ff75c3', '#ffa647', '#ffe83f', '#9fff5b', '#70e2ff', '#cd93ff', '#09203f'];

  const gradients = [
    'linear-gradient(to bottom right,#accbee,#e7f0fd)',
    'linear-gradient(to bottom right,#d5d4d0,#d5d4d0,#eeeeec)',
    'linear-gradient(to bottom right,#000000,#434343)',
    'linear-gradient(to bottom right,#09203f,#537895)',
    'linear-gradient(to bottom right,#AC32E4,#7918F2,#4801FF)',
    'linear-gradient(to bottom right,#f953c6,#b91d73)',
    'linear-gradient(to bottom right,#ee0979,#ff6a00)',
    'linear-gradient(to bottom right,#F00000,#DC281E)',
    'linear-gradient(to bottom right,#00c6ff,#0072ff)',
    'linear-gradient(to bottom right,#4facfe,#00f2fe)',
    'linear-gradient(to bottom right,#0ba360,#3cba92)',
    'linear-gradient(to bottom right,#FDFC47,#24FE41)',
    'linear-gradient(to bottom right,#8a2be2,#0000cd,#228b22,#ccff00)',
    'linear-gradient(to bottom right,#40E0D0,#FF8C00,#FF0080)',
    'linear-gradient(to bottom right,#fcc5e4,#fda34b,#ff7882,#c8699e,#7046aa,#0c1db8,#020f75)',
    'linear-gradient(to bottom right,#ff75c3,#ffa647,#ffe83f,#9fff5b,#70e2ff,#cd93ff)',
  ];

  const images = [
    'url(https://images.unsplash.com/photo-1691200099282-16fd34790ade?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2532&q=90)',
    'url(https://images.unsplash.com/photo-1691226099773-b13a89a1d167?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2532&q=90',
    'url(https://images.unsplash.com/photo-1688822863426-8c5f9b257090?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2532&q=90)',
    'url(https://images.unsplash.com/photo-1691225850735-6e4e51834cad?ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D&auto=format&fit=crop&w=2532&q=90)',
  ];

  const defaultTab = useMemo(() => {
    if (background.includes('url')) return 'image';
    if (background.includes('gradient')) return 'gradient';
    return 'solid';
  }, [background]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant={'ghost'} size="xs" className={cn('justify-start text-left font-normal', !background && 'text-muted-foreground', className)}>
          <div className="flex w-full items-center gap-2">
            {background ? (
              <div className="h-4 w-4 rounded !bg-cover !bg-center transition-all" style={{ background }} />
            ) : (
              <Paintbrush className="h-4 w-4" />
            )}
            {showText && <div className="flex-1 truncate">{background ? background : 'Pick a color'}</div>}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64" align="start">
        <Tabs defaultValue={defaultTab} className="w-full">
          {options.length > 1 && (
            <TabsList className="mb-4 w-full">
              {options.map((pickerOption) => (
                <TabsTrigger className="flex-1" value={pickerOption} key={pickerOption}>
                  {pickerOption.charAt(0).toUpperCase() + pickerOption.slice(1)}
                </TabsTrigger>
              ))}
            </TabsList>
          )}

          <TabsContent value="solid" className="mt-0 flex flex-wrap gap-1" tabIndex={-1} asChild>
            <RadioGroup>
              {solids.map((bg) => (
                <RadioGroupItem
                  key={bg}
                  className="h-6 w-6 p-0 cursor-pointer rounded-md active:scale-105 border-0 focus-visible:ring-2"
                  checked={false}
                  value={bg}
                  style={{ background: bg }}
                  onClick={() => setBackground(bg)}
                  aria-label={bg}
                />
              ))}
            </RadioGroup>
          </TabsContent>

          <TabsContent value="gradient" className="mt-0 mb-2 flex flex-wrap gap-1" tabIndex={-1} asChild>
            <RadioGroup>
              {gradients.map((bg) => (
                <RadioGroupItem
                  key={bg}
                  aria-label={bg}
                  style={{ background: bg }}
                  className="h-6 w-6 cursor-pointer rounded-md active:scale-105 border-none"
                  checked={false}
                  value={bg}
                  onClick={() => setBackground(bg)}
                />
              ))}
            </RadioGroup>
          </TabsContent>

          <TabsContent value="image" className="mt-0 mb-2 grid grid-cols-2 gap-1" tabIndex={-1} asChild>
            <RadioGroup>
              {images.map((bg) => (
                <RadioGroupItem
                  key={bg}
                  aria-label={bg}
                  style={{ backgroundImage: bg }}
                  className="h-12 w-full cursor-pointer rounded-md bg-cover bg-center active:scale-105 border-none"
                  checked={false}
                  value={bg}
                  onClick={() => setBackground(bg)}
                />
              ))}
            </RadioGroup>
          </TabsContent>
        </Tabs>

        <Input id="custom" value={background} className="col-span-2 mt-4 h-8" onChange={(e) => setBackground(e.currentTarget.value)} />
      </PopoverContent>
    </Popover>
  );
}
