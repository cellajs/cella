import { MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExpandableTile, ExpandableTileDetail, type ExpandableTileProps } from '~/modules/common/expandable-tile';

/** What a session or a passkey records of the browser it was made in. */
interface Device {
  deviceType: 'desktop' | 'mobile';
  deviceName: string | null;
  deviceOs: string | null;
  browser: string | null;
}

type DeviceTileProps = Omit<ExpandableTileProps, 'icon' | 'iconLabel' | 'title'> & { device: Device };

/** A session or a passkey as a tile, named after its browser, with the device model among the details. */
export function DeviceTile({ device, details, ...props }: DeviceTileProps) {
  const { t } = useTranslation();

  const isDesktop = device.deviceType === 'desktop';
  // A browser on its OS tells two browsers on one machine apart; the user agent names a model for Apple and Android devices only
  const browserOnOs = device.browser && device.deviceOs ? t('c:browser_on', { browser: device.browser, os: device.deviceOs }) : null;
  const name = browserOnOs || device.deviceName || device.browser || device.deviceOs || t('c:unknown_device');

  return (
    <ExpandableTile
      icon={isDesktop ? <MonitorIcon /> : <SmartphoneIcon />}
      iconLabel={t(isDesktop ? 'c:desktop' : 'c:mobile')}
      title={name}
      details={
        <>
          {details}
          {device.deviceName && device.deviceName !== name && <ExpandableTileDetail label={t('c:device')}>{device.deviceName}</ExpandableTileDetail>}
        </>
      }
      {...props}
    />
  );
}
