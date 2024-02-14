import { config } from 'config';
import L from 'leaflet';
import { useEffect, useRef } from 'react';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import '~/modules/common/contact-form/leaflet.css';

// Define the prop types for CustomMarker
interface CustomMarkerProps {
  isActive: boolean;
  map: L.Map | null;
  positionArray: L.LatLngExpression;
}

const greenIcon = L.icon({
  iconUrl: '/logo/logo-icon-only.svg',
  iconSize: [30, 30], // size of the icon
  iconAnchor: [15, 15], // point of the icon which will correspond to marker's location
  popupAnchor: [0, 0], // point from which the popup should open relative to the iconAnchor
});

// Updated CustomMarker to use hardcoded config
const CustomMarker = ({ isActive, map, positionArray }: CustomMarkerProps) => {
  const popupRef = useRef<L.Popup | null>(null);

  useEffect(() => {
    if (isActive && map && popupRef.current) {
      popupRef.current.openOn(map);
    }
  }, [isActive, map]);

  return (
    <Marker position={positionArray} icon={greenIcon}>
      <Popup
        className="text-sm"
        ref={(r) => {
          if (r) popupRef.current = r;
        }}
      >
        <strong className="block">{config.company.name}</strong>
        <span className="block">{config.company.streetAddress}</span>
        <span className="block">{config.company.country}</span>
        <a href={config.company.googleMapsUrl} target="_blank" className="text-primary" rel="noopener noreferrer">
          Get directions
        </a>
      </Popup>
    </Marker>
  );
};

const ContactFormMap = () => {
  const positionArray = [config.company.coordinates.lat, config.company.coordinates.lon] as L.LatLngExpression;
  const mapRef = useRef<L.Map>(null);
  const mapContainerClass = 'w-full h-full md:pb-12 md:px-4 overflow-hidden';

  if (positionArray)
    return (
      <div className={mapContainerClass}>
        <MapContainer center={positionArray} zoom={config.company.mapZoom} scrollWheelZoom={false} className="h-full w-full" ref={mapRef}>
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            attribution={'&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'}
          />
          <CustomMarker map={mapRef.current} isActive positionArray={positionArray} />
        </MapContainer>
      </div>
    );
};

export default ContactFormMap;
