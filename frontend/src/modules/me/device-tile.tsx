import { MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableTile, type ExpandableTileProps } from '~/modules/common/expandable-tile';

/** What a session or a passkey records of the browser it was made in. */
interface Device {
  deviceType: 'desktop' | 'mobile';
  deviceName: string | null;
  deviceOs: string | null;
  browser: string | null;
}

type DeviceTileProps = Omit<ExpandableTileProps, 'icon' | 'iconLabel' | 'title'> & { device: Device };

/** A session or a passkey as a tile, named after its device. */
export function DeviceTile({ device, ...props }: DeviceTileProps) {
  const { t } = useTranslation();

  const isDesktop = device.deviceType === 'desktop';
  // The user agent names Apple and Android models only; a browser on its OS still tells the others apart
  const browserOnOs = device.browser && device.deviceOs ? t('c:browser_on', { browser: device.browser, os: device.deviceOs }) : null;
  const name = device.deviceName || browserOnOs || device.browser || device.deviceOs || t('c:unknown_device');

  return (
    <ExpandableTile
      icon={isDesktop ? <MonitorIcon /> : <SmartphoneIcon />}
      iconLabel={t(isDesktop ? 'c:desktop' : 'c:mobile')}
      title={name}
      {...props}
    />
  );
}
