import {
  AdvancedMarker,
  APIProvider,
  ControlPosition,
  Map as GMap,
  InfoWindow,
  MapControl,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { appConfig } from 'config';
import { ArrowUpRightIcon, MilestoneIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import useMountedState from '~/hooks/use-mounted-state';
import ErrorNotice, { type ErrorNoticeError } from '~/modules/common/error-notice';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';
import Logo from '/static/logo/logo-icon-only.svg';

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

function MarkerWithInfoWindow({ position }: { position: { lat: number; lng: number } }) {
  const { t } = useTranslation();
  const [markerRef, marker] = useAdvancedMarkerRef();
  const [infowindowOpen, setInfowindowOpen] = useState(true);

  return (
    <>
      <AdvancedMarker ref={markerRef} onClick={() => setInfowindowOpen(true)} position={position} title="More info">
        <img src={Logo} width="30" height="30" alt={appConfig.name} />
      </AdvancedMarker>

      {infowindowOpen && (
        <InfoWindow headerDisabled={true} anchor={marker}>
          <div className="text-xs text-slate-800 min-w-36 p-1">
            <div className="flex justify-between items-center">
              <strong className="text-sm ">{appConfig.company.name}</strong>
              <Button onClick={() => setInfowindowOpen(false)} size="micro" variant="ghost">
                <XIcon size={14} />
              </Button>
            </div>
            <span className="block">{appConfig.company.streetAddress}</span>
            <span className="block">{appConfig.company.country}</span>
            <a
              href={appConfig.company.googleMapsUrl}
              target="_blank"
              className="font-semibold flex mt-1 rounded-md p-1 focus-effect"
              rel="noreferrer"
            >
              <MilestoneIcon size={12} strokeWidth={2.5} className="mr-1" />
              {t('common:get_directions')}
              <ArrowUpRightIcon size={12} className="ml-1 opacity-50" />
            </a>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

type CustomZoomControlProps = {
  controlPosition: ControlPosition;
  zoom: number;
  onZoomChange: (zoom: number) => void;
};

function CustomZoomControl({ controlPosition, zoom, onZoomChange }: CustomZoomControlProps) {
  return (
    <MapControl position={controlPosition}>
      <div className="flex flex-col m-2 p-1">
        <Button
          onClick={() => onZoomChange(zoom + 0.5)}
          size="micro"
          variant="outlineGhost"
          className="border-b-0 rounded-b-none"
        >
          <PlusIcon size={14} />
        </Button>
        <Button onClick={() => onZoomChange(zoom - 0.5)} size="micro" variant="outlineGhost" className="rounded-t-none">
          <MinusIcon size={14} />
        </Button>
      </div>
    </MapControl>
  );
}

function ContactFormMap() {
  const mode = useUIStore((state) => state.mode);
  const [zoom, setZoom] = useState(appConfig.company.mapZoom);
  const [mapConfig] = useState<MapConfig>(mode === 'dark' ? mapStyles[1] : mapStyles[0]);
  const { hasStarted } = useMountedState();

  if (!appConfig.company.coordinates || !appConfig.googleMapsKey) return null;

  return (
    <ErrorBoundary
      fallbackRender={({ error, resetErrorBoundary }) => (
        <ErrorNotice boundary="app" error={error as ErrorNoticeError} resetErrorBoundary={resetErrorBoundary} />
      )}
    >
      <div className="w-full h-full">
        <div className="w-full h-full rounded-sm overflow-hidden bg-accent">
          <APIProvider apiKey={appConfig.googleMapsKey} libraries={['marker']}>
            <AnimatePresence>
              {hasStarted && (
                <motion.div
                  key="gmap"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.5, delay: 1 }}
                  className="w-full h-full"
                >
                  <GMap
                    mapId={mapConfig.mapId || null}
                    mapTypeId={mapConfig.mapTypeId}
                    gestureHandling="greedy"
                    disableDefaultUI
                    defaultCenter={appConfig.company.coordinates}
                    zoom={zoom}
                    defaultZoom={appConfig.company.mapZoom}
                  >
                    <MarkerWithInfoWindow position={appConfig.company.coordinates} />
                    <CustomZoomControl
                      controlPosition={ControlPosition.LEFT_BOTTOM}
                      zoom={zoom}
                      onZoomChange={setZoom}
                    />
                  </GMap>
                </motion.div>
              )}
            </AnimatePresence>
          </APIProvider>
        </div>
      </div>
    </ErrorBoundary>
  );
}
export default ContactFormMap;
