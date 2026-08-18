import type { ShadCNComponents } from '@blocknote/shadcn';
import * as Badge from '~/modules/ui/badge';
import * as Button from '~/modules/ui/button';
import * as Card from '~/modules/ui/card';
import * as DropdownMenu from '~/modules/ui/dropdown-menu';
import * as Input from '~/modules/ui/input';
import * as Label from '~/modules/ui/label';
import * as Popover from '~/modules/ui/popover';
import * as Select from '~/modules/ui/select';
import * as Tabs from '~/modules/ui/tabs';
import * as Toggle from '~/modules/ui/toggle';
import * as Tooltip from '~/modules/ui/tooltip';

// Both sides speak Base UI: triggers take `render` props and popup content takes a `container` (editor.portalElement).
// The cast is needed because this kit narrows some Base UI prop types and uses different cva variant unions.
export const shadCNComponents = {
  Button,
  DropdownMenu,
  Select,
  Popover,
  Tooltip,
  Label,
  Input,
  Card,
  Badge,
  Toggle,
  Tabs,
} as unknown as Partial<ShadCNComponents>;
