import { ArrowUpRightIcon, MilestoneIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { useMountedState } from '~/hooks/use-mounted-state';
import { CloseButton } from '~/modules/common/close-button';
import '~/modules/common/contact-form/contact-form-map.css';
import { errorNoticeFallback } from '~/modules/common/error-notice';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';
import logoUrl from '/static/common/logo/logo-icon-only.svg';

// MapLibre looks for its worker next to its own module, a path bundling does not keep, so Vite builds the worker.
setWorkerUrl(mapWorkerUrl);

/** Company logo on the map with the address card above it, open on load. */
function CompanyMarker() {
  const { t } = useTranslation();
  const [cardOpen, setCardOpen] = useState(true);

  return (
    <div className="relative">
      {cardOpen && (
        <div className="absolute bottom-full left-1/2 mb-3 min-w-36 -translate-x-1/2 rounded-md border bg-popover p-2 text-popover-foreground text-xs shadow-md">
          <div className="flex items-center justify-between gap-2">
            <strong className="text-sm">{appConfig.company.name}</strong>
            <CloseButton onClick={() => setCardOpen(false)} size="sm" />
          </div>
          <span className="block">{appConfig.company.streetAddress}</span>
          <span className="block">{appConfig.company.country}</span>
          <a
            href={appConfig.company.directionsUrl}
            target="_blank"
            className="focus-effect mt-1 flex items-center gap-1 rounded-md p-1 font-semibold"
            rel="noreferrer"
          >
            <MilestoneIcon strokeWidth={2.5} className="size-3" />
            {t('c:get_directions')}
            <ArrowUpRightIcon className="size-3 opacity-50" />
          </a>
          <span className="absolute top-full left-1/2 -mt-1.5 size-3 -translate-x-1/2 rotate-45 border-r border-b bg-popover" />
        </div>
      )}
      <button type="button" onClick={() => setCardOpen(true)} className="block cursor-pointer" title={appConfig.company.name}>
        <img src={logoUrl} width="30" height="30" alt={appConfig.name} />
      </button>
    </div>
  );
}

interface CompanyMapProps {
  styleUrl: string;
}

/** Interactive map centred on the company, drawn with the style for the current color mode. */
function CompanyMap({ styleUrl }: CompanyMapProps) {
  const { t } = useTranslation();
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [markerNode] = useState(() => document.createElement('div'));

  useEffect(() => {
    if (!containerRef.current) return;
    const { coordinates, mapZoom } = appConfig.company;
    const instance = new MapLibreMap({
      container: containerRef.current,
      style: styleUrl,
      center: coordinates,
      zoom: mapZoom,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
    });
    instance.touchZoomRotate.disableRotation();
    new Marker({ element: markerNode }).setLngLat(coordinates).addTo(instance);
    setMap(instance);
    return () => instance.remove();
  }, [styleUrl, markerNode]);

  return (
    <div className="contact-map relative size-full">
      <div ref={containerRef} className="size-full" />
      {createPortal(<CompanyMarker />, markerNode)}
      <div className="absolute bottom-0 left-0 m-2 flex flex-col p-1">
        <Button
          onClick={() => map?.zoomTo(map.getZoom() + 0.5)}
          size="micro"
          variant="outlineGhost"
          className="rounded-b-none border-b-0"
          aria-label={t('c:zoom_in')}
        >
          <PlusIcon className="size-3.5" />
        </Button>
        <Button
          onClick={() => map?.zoomTo(map.getZoom() - 0.5)}
          size="micro"
          variant="outlineGhost"
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
  const { hasStarted } = useMountedState();

  if (!styleUrl) return null;

  return (
    <ErrorBoundary fallbackRender={errorNoticeFallback('app')}>
      {hasStarted && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5, delay: 1 }} className="size-full">
          <CompanyMap styleUrl={styleUrl} />
        </motion.div>
      )}
    </ErrorBoundary>
  );
}
