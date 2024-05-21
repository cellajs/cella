import { config } from 'config';
import { useState } from 'react';
import Logo from '/static/logo/logo-icon-only.svg';
import { useTranslation } from 'react-i18next';
import '~/modules/common/contact-form/leaflet.css';
import { AdvancedMarker, APIProvider, InfoWindow, Map as GMap, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { useThemeStore } from '~/store/theme';

type MapConfig = {
  id: string;
  label: string;
  mapId?: string;
  mapTypeId?: string;
  styles?: google.maps.MapTypeStyle[];
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
      <AdvancedMarker
        ref={markerRef}
        onClick={() => setInfowindowOpen(true)}
        position={position}
        title={'Marker that opens an Infowindow when clicked.'}
      >
        <img src={Logo} width="30" height="30" alt="Cella" />
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
  const position = { lat: config.company.coordinates.lat, lng: config.company.coordinates.lon };
  const mapApiKey = process.env.GOOGLE_MAP_API_KEY || 'AIzaSyAl84y68d7u6lVO5LZvR6ThQd6iMYKNXys';
  if (position)
    return (
      <div className="w-full h-full md:pb-12 md:px-4 overflow-hidden">
        <APIProvider apiKey={mapApiKey} libraries={['marker']}>
          <GMap
            mapId={mapConfig.mapId || null}
            mapTypeId={mapConfig.mapTypeId}
            styles={mapConfig.styles}
            gestureHandling={'greedy'}
            disableDefaultUI
            defaultCenter={position}
            defaultZoom={5}
          >
            <MarkerWithInfowindow position={position} />
          </GMap>
        </APIProvider>
      </div>
    );
};
export default ContactFormMap;
