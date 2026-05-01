import { useState, useCallback } from 'react';
import { Marker } from '@react-google-maps/api';
import { MapPin, MagnifyingGlass, Crosshair } from '@phosphor-icons/react';
import { GoogleMap } from '@/components/GoogleMap';
import { PlaceSearch } from '@/components/PlaceSearch';
import { Mono, Pill } from '@/components/redesign';
import { cn } from '@/lib/utils';

interface SelectedLocation {
  lat: number;
  lng: number;
  name?: string;
}

interface MapLocationPickerProps {
  onSelectLocation: (location: { lat: number; lng: number; name: string }) => void;
  onCancel: () => void;
  initialCenter?: { lat: number; lng: number };
}

export function MapLocationPicker({ onSelectLocation, onCancel, initialCenter }: MapLocationPickerProps) {
  const defaultCenter = initialCenter || { lat: 39.8283, lng: -98.5795 };
  const defaultZoom = initialCenter ? 10 : 4;
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultZoom);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [locationName, setLocationName] = useState('');

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      setSelectedLocation({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      setLocationName('');
    }
  }, []);

  const handlePlaceSelect = useCallback((place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setSelectedLocation({ lat, lng, name: place.name });
      setLocationName(place.name || '');
      setMapCenter({ lat, lng });
      setMapZoom(12);
    }
  }, []);

  const handleConfirm = () => {
    if (selectedLocation) {
      const name =
        locationName.trim() ||
        `Location (${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)})`;
      onSelectLocation({ lat: selectedLocation.lat, lng: selectedLocation.lng, name });
    }
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const lat = position.coords.latitude;
          const lng = position.coords.longitude;
          setSelectedLocation({ lat, lng });
          setMapCenter({ lat, lng });
          setMapZoom(12);
          setLocationName('');
        },
        (error) => {
          console.error('Error getting location:', error);
        },
      );
    }
  };

  const inputCls =
    'w-full h-10 px-3 rounded-[12px] border border-line bg-white dark:bg-paper-2 text-ink text-[14px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors';

  return (
    <div className="flex flex-col h-full bg-paper text-ink font-sans">
      {/* Search section */}
      <div className="p-4 border-b border-line bg-cream dark:bg-paper-2 space-y-2.5">
        <Mono className="text-pine-6 inline-flex items-center gap-1.5">
          <MagnifyingGlass className="w-3 h-3" weight="regular" />
          Search for a location
        </Mono>
        <PlaceSearch onPlaceSelect={handlePlaceSelect} placeholder="Search places…" />
        <Pill
          variant="ghost"
          mono={false}
          onClick={handleUseCurrentLocation}
          className="!w-full !justify-center"
        >
          <Crosshair className="w-3.5 h-3.5" weight="regular" />
          Use my current location
        </Pill>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <GoogleMap
          center={mapCenter}
          zoom={mapZoom}
          onClick={handleMapClick}
          className="w-full h-full"
        >
          {selectedLocation && (
            <Marker
              position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
              animation={google.maps.Animation.DROP}
            />
          )}
        </GoogleMap>

        {!selectedLocation && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white/95 backdrop-blur-md border border-line rounded-full shadow-[0_8px_22px_rgba(29,34,24,.10)] px-4 py-2">
            <p className="text-[12px] font-mono font-semibold uppercase tracking-[0.10em] text-ink-2 inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-pine-6" weight="regular" />
              Click on the map to drop a pin
            </p>
          </div>
        )}
      </div>

      {/* Selected location details */}
      {selectedLocation ? (
        <div className="p-4 border-t border-line bg-cream dark:bg-paper-2 space-y-3">
          <div className="inline-flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 text-pine-6" weight="fill" />
            <Mono className="text-ink-2">
              {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
            </Mono>
          </div>

          <div className="space-y-1.5">
            <Mono className="text-ink-2 block">Location name</Mono>
            <input
              id="location-name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Enter a name for this location"
              className={inputCls}
            />
          </div>

          <div className="flex items-center gap-2">
            <Pill variant="ghost" mono={false} onClick={onCancel} className="!flex-1 !justify-center">
              Cancel
            </Pill>
            <Pill variant="solid-pine" mono={false} onClick={handleConfirm} className="!flex-1 !justify-center">
              <MapPin className="w-3.5 h-3.5" weight="regular" />
              Add location
            </Pill>
          </div>
        </div>
      ) : (
        <div className="p-4 border-t border-line bg-cream dark:bg-paper-2">
          <Pill variant="ghost" mono={false} onClick={onCancel} className="!w-full !justify-center">
            Cancel
          </Pill>
        </div>
      )}
    </div>
  );
}
