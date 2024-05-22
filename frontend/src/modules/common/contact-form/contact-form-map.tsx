import { config } from 'config';
import { useState } from 'react';
import Logo from '/static/logo/logo-icon-only.svg';
import { useTranslation } from 'react-i18next';
import { AdvancedMarker, APIProvider, InfoWindow, Map as GMap, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { useThemeStore } from '~/store/theme';

type MapConfig = {
  id: string;
  label: string;
  mapId?: string;
  mapTypeId?: string;
};

const mapStyles: MapConfig[] = [
  {
    id: 'light',
    label: 'Light',
    mapId: '49ae42fed52588c3',
    mapTypeId: 'roadmap',
  },
  {
    id: 'dark',
    label: 'Dark',
    mapId: '739af084373f96fe',
    mapTypeId: 'roadmap',
  },
];

export const MarkerWithInfowindow = ({ position }: { position: { lat: number; lng: number } }) => {
  const { t } = useTranslation();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infowindowOpen, setInfowindowOpen] = useState(true);

  return (
    <>
      <AdvancedMarker ref={markerRef} onClick={() => setInfowindowOpen(true)} position={position} title="More info">
        <img src={Logo} width="30" height="30" alt={config.name} />
      </AdvancedMarker>

      {infowindowOpen && (
        <InfoWindow anchor={marker} onCloseClick={() => setInfowindowOpen(false)}>
          <div className="text-xs text-slate-800">
            <strong className="block">{config.company.name}</strong>
            <span className="block">{config.company.streetAddress}</span>
            <span className="block">{config.company.country}</span>
            <a href={config.company.googleMapsUrl} target="_blank" className="text-primary" rel="noreferrer">
              {t('common:get_directions')}
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

const ContactFormMap = () => {
  const { mode } = useThemeStore();
  const [mapConfig] = useState<MapConfig>(mode === 'dark' ? mapStyles[1] : mapStyles[0]);

  if (config.company.coordinates && config.googleMapsKey)
    return (
      <div className="w-full h-full md:pb-12 md:px-4 overflow-hidden">
        <APIProvider apiKey={config.googleMapsKey} libraries={['marker']}>
          <GMap
            mapId={mapConfig.mapId || null}
            mapTypeId={mapConfig.mapTypeId}
            gestureHandling={'greedy'}
            disableDefaultUI
            defaultCenter={config.company.coordinates}
            defaultZoom={config.company.mapZoom}
          >
            <MarkerWithInfowindow position={config.company.coordinates} />
          </GMap>
        </APIProvider>
      </div>
    );
};
export default ContactFormMap;
