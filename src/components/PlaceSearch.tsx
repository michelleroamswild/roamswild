import { useRef, useState } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { MapPin, MagnifyingGlass } from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { PlaceResult } from '@/types/maps';
import { useGoogleMaps } from './GoogleMapsProvider';

interface PlaceSearchProps {
  onPlaceSelect: (place: PlaceResult | google.maps.places.PlaceResult) => void;
  placeholder?: string;
  className?: string;
  defaultValue?: string;
}

export function PlaceSearch({ onPlaceSelect, placeholder = "Search for a place...", className, defaultValue }: PlaceSearchProps) {
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState(defaultValue || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { isLoaded } = useGoogleMaps();

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.place_id) {
        setInputValue(place.name || place.formatted_address || '');
        onPlaceSelect(place);
      }
    }
  };

  if (!isLoaded) {
    return (
      <div className={`relative ${className}`}>
        <MagnifyingGlass className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          disabled
          placeholder="Loading..."
          className="pl-12"
        />
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      <MapPin className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
      <Autocomplete
        onLoad={onLoad}
        onPlaceChanged={onPlaceChanged}
        options={{
          types: ['establishment', 'geocode'],
          fields: ['place_id', 'name', 'formatted_address', 'geometry'],
        }}
      >
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="pl-12"
        />
      </Autocomplete>
    </div>
  );
}
