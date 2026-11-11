import { ArrowUpRightIcon, MilestoneIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { appConfig, type CompanyAddress } from 'shared';
import { settledAfterMountMs, useDelayedFlag } from '~/hooks/use-delayed-flag';
import { CloseButton } from '~/modules/common/close-button';
import '~/modules/common/contact-form/contact-form-map.css';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import { regionName } from '~/utils/region-name';
import logoUrl from '/static/common/logo/logo-icon-only.svg';

// MapLibre looks for its worker next to its own module, a path bundling does not keep, so Vite builds the worker.
setWorkerUrl(mapWorkerUrl);

/** Company logo on the map with the address card above it, open on load. */
function CompanyMarker({ address }: { address: CompanyAddress }) {
  const { t, i18n } = useTranslation();
  const [cardOpen, setCardOpen] = useState(true);

  return (
    <div className="relative">
      {cardOpen && (
        <div className="bg-popover text-popover-foreground absolute bottom-full left-1/2 mb-3 min-w-36 -translate-x-1/2 rounded-md border p-2 text-xs shadow-md">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">{appConfig.company.name}</strong>
            <CloseButton onClick={() => setCardOpen(false)} size="sm" />
          </div>
          <span className="block">{address.streetAddress}</span>
          <span className="block">
            {address.city}, {address.postalCode}
          </span>
          <span className="block">{regionName(address.regionCode, i18n.language)}</span>
          {address.directionsUrl && (
            <a
              href={address.directionsUrl}
              target="_blank"
              className="focus-effect mt-1 flex items-center gap-1 rounded-md p-1 font-semibold"
              rel="noreferrer"
            >
              <MilestoneIcon strokeWidth={2.5} className="size-3" />
              {t('c:get_directions')}
              <ArrowUpRightIcon className="size-3 opacity-50" />
            </a>
          )}
          <span className="bg-popover absolute top-full left-1/2 -mt-1.5 size-3 -translate-x-1/2 rotate-45 border-r border-b" />
        </div>
      )}
      <button type="button" onClick={() => setCardOpen(true)} className="block cursor-pointer" title={appConfig.company.name}>
        <img src={logoUrl} width="30" height="30" alt={appConfig.name} draggable={false} />
      </button>
    </div>
  );
}

/** Interactive map centred on the company, drawn with the style for the current color mode. */
function CompanyMap({ styleUrl, address, center }: { styleUrl: string; address: CompanyAddress; center: { lat: number; lng: number } }) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [markerNode] = useState(() => document.createElement('div'));

  useEffect(() => {
    if (!containerRef.current) return;
    const instance = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center,
      zoom: appConfig.mapZoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    instance.touchZoomRotate.disableRotation();
    // Draws the center 40px below the middle, so the address card above the marker fits inside the map
    instance.setPadding({ top: 80 });
    new Marker({ element: markerNode }).setLngLat(center).addTo(instance);
    setMap(instance);
    return () => instance.remove();
  }, [styleUrl, center, markerNode]);

  return (
    <div className="contact-map relative size-full">
      <div ref={containerRef} className="size-full" />
      {createPortal(<CompanyMarker address={address} />, markerNode)}
      <div className="absolute bottom-0 left-0 m-2 flex flex-col p-1">
        <Button
          onClick={() => map?.zoomTo(map.getZoom() + 0.5)}
          size="micro"
          variant="outline-ghost"
          className="rounded-b-none border-b-0"
          aria-label={t('c:zoom_in')}
        >
          <PlusIcon className="size-3.5" />
        </Button>
        <Button
          onClick={() => map?.zoomTo(map.getZoom() - 0.5)}
          size="micro"
          variant="outline-ghost"
          className="rounded-t-none"
          aria-label={t('c:zoom_out')}
        >
          <MinusIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

export function ContactFormMap() {
  const styleUrl = useUIStore((state) => appConfig.mapStyleUrls[state.mode]);
  const hasStarted = useDelayedFlag(true, settledAfterMountMs);
  const { address } = appConfig.company;

  if (!styleUrl || !address?.coordinates) return null;

  return (
    <ErrorBoundary fallbackRender={errorNoticeFallback('app')}>
      {hasStarted && (
        <div className="mount-fade size-full delay-1000 duration-500">
          <CompanyMap styleUrl={styleUrl} address={address} center={address.coordinates} />
        </div>
      )}
    </ErrorBoundary>
  );
}
