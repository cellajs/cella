import { APIProvider, AdvancedMarker, ControlPosition, Map as GMap, InfoWindow, MapControl, useAdvancedMarkerRef } from '@vis.gl/react-google-maps';
import { config } from 'config';
import { Minus, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { useThemeStore } from '~/store/theme';
import Logo from '/static/logo/logo-icon-only.svg';
import ErrorNotice from '../error-notice';

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

const MarkerWithInfowindow = ({ position }: { position: { lat: number; lng: number } }) => {
  const { t } = useTranslation();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infowindowOpen, setInfowindowOpen] = useState(true);

  return (
    <>
      <AdvancedMarker ref={markerRef} onClick={() => setInfowindowOpen(true)} position={position} title="More info">
        <img src={Logo} width="30" height="30" alt={config.name} />
      </AdvancedMarker>

      {infowindowOpen && (
        <InfoWindow headerDisabled={true} anchor={marker}>
          <div className="text-xs text-slate-800 min-w-32">
            <div className="flex justify-between items-center">
              <strong className="text-sm ">{config.company.name}</strong>
              <Button onClick={() => setInfowindowOpen(false)} size="micro" variant="ghost">
                <X size={14} />
              </Button>
            </div>
            <span className="block">{config.company.streetAddress}</span>
            <span className="block">{config.company.country}</span>
            <a href={config.company.googleMapsUrl} target="_blank" rel="noreferrer">
              {t('common:get_directions')}
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

type CustomZoomControlProps = {
  controlPosition: ControlPosition;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

const CustomZoomControl = ({ controlPosition, zoom, onZoomChange }: CustomZoomControlProps) => {
  return (
    <MapControl position={controlPosition}>
      <div className="flex flex-col m-2 p-1">
        <Button onClick={() => onZoomChange(zoom + 0.5)} size="micro" variant="outlineGhost" className="border-b-0 rounded-b-none">
          <Plus size={14} />
        </Button>
        <Button onClick={() => onZoomChange(zoom - 0.5)} size="micro" variant="outlineGhost" className="rounded-t-none">
          <Minus size={14} />
        </Button>
      </div>
    </MapControl>
  );
};

const ContactFormMap = () => {
  const { mode } = useThemeStore();
  const [zoom, setZoom] = useState(config.company.mapZoom);
  const [mapConfig] = useState<MapConfig>(mode === 'dark' ? mapStyles[1] : mapStyles[0]);

  if (config.company.coordinates && config.googleMapsKey)
    return (
      <ErrorBoundary fallbackRender={({ error, resetErrorBoundary }) => <ErrorNotice error={error} resetErrorBoundary={resetErrorBoundary} />}>
        <div className="w-full h-full md:pb-12 md:px-4 overflow-hidden">
          <APIProvider apiKey={config.googleMapsKey} libraries={['marker']}>
            <GMap
              mapId={mapConfig.mapId || null}
              mapTypeId={mapConfig.mapTypeId}
              gestureHandling={'greedy'}
              disableDefaultUI
              defaultCenter={config.company.coordinates}
              zoom={zoom}
              defaultZoom={config.company.mapZoom}
            >
              <MarkerWithInfowindow position={config.company.coordinates} />
              <CustomZoomControl controlPosition={ControlPosition.LEFT_BOTTOM} zoom={zoom} onZoomChange={(zoom) => setZoom(zoom)} />
            </GMap>
          </APIProvider>
        </div>
      </ErrorBoundary>
    );
};
export default ContactFormMap;
