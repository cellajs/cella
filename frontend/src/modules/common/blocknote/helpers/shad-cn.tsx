import * as Badge from '~/modules/ui/badge';
import * as Button from '~/modules/ui/button';
import * as Card from '~/modules/ui/card';
import * as DropdownMenu from '~/modules/ui/dropdown-menu';
import * as Input from '~/modules/ui/input';
import * as Label from '~/modules/ui/label';
import * as Select from '~/modules/ui/select';
import * as Tabs from '~/modules/ui/tabs';
import * as Toggle from '~/modules/ui/toggle';
import * as Tooltip from '~/modules/ui/tooltip';

// To ensure compatibility, your ShadCN components should not use Portals (comment these out from your DropdownMenu, Popover and Select components).
export const shadCNComponents = { Button, DropdownMenu, Tooltip, Select, Label, Input, Card, Badge, Toggle, Tabs };
