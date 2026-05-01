import { useRef, useState } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { MapPin, MagnifyingGlass } from '@phosphor-icons/react';
import { PlaceResult } from '@/types/maps';
import { useGoogleMaps } from './GoogleMapsProvider';
import { cn } from '@/lib/utils';

interface PlaceSearchProps {
  onPlaceSelect: (place: PlaceResult | google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

// Pine + Paper styled wrapper around Google Places Autocomplete. Uses the
// same input chrome as the auth forms / wizard fields: h-12, rounded-[14px],
// line border that turns pine on focus, ink-3 placeholder.
const inputClass =
  'w-full h-12 pl-11 pr-4 rounded-[14px] border border-line bg-white dark:bg-paper-2 text-ink text-[15px] outline-none placeholder:text-ink-3 focus:border-pine-6 transition-colors';

export function PlaceSearch({
  onPlaceSelect,
  placeholder = 'Search for a place…',
  className,
  defaultValue,
}: PlaceSearchProps) {
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);

  const { isLoaded } = useGoogleMaps();

  const onLoad = (instance: google.maps.places.Autocomplete) => setAutocomplete(instance);

  const onPlaceChanged = () => {
    if (!autocomplete) return;
    const place = autocomplete.getPlace();
    if (place.geometry?.location && place.place_id) {
      setInputValue(place.name || place.formatted_address || '');
      onPlaceSelect(place);
    }
  };

  if (!isLoaded) {
    return (
      <div className={cn('relative', className)}>
        <MagnifyingGlass
          className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3"
          weight="regular"
        />
        <input disabled placeholder="Loading…" className={inputClass} />
      </div>
    );
  }

  return (
    <div className={cn('relative', className)}>
      <MapPin
        className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 z-10"
        weight="regular"
      />
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          types: ['establishment', 'geocode'],
          fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types'],
        }}
      >
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className={inputClass}
        />
      </Autocomplete>
    </div>
  );
}
