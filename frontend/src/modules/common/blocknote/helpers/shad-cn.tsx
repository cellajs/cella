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

/**
 * Maps BlockNote elements to the application UI components. Since @blocknote/shadcn 0.53
 * both sides speak Base UI: triggers receive `render` props and popup content receives a
 * `container` (editor.portalElement) that our components forward to their portals.
 */
// Cast: our kit deliberately narrows some Base UI prop types (string-only className,
// single-value Select) and uses different cva variant unions than BlockNote's defaults.
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
