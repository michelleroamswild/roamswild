import { useRef, useState } from 'react';
import { useLoadScript, Autocomplete } from '@react-google-maps/api';
import { MapPin, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { PlaceResult } from '@/types/maps';

const libraries: ("places")[] = ["places"];

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

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
    libraries
  });

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
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 w-5 h-5 text-muted-foreground" />
        <Input
          disabled
          placeholder="Loading..."
          className="pl-12 pr-4 h-12 rounded-full bg-card border-border"
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
          className="pl-12 pr-4 h-12 rounded-full bg-card border-border focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </Autocomplete>
    </div>
  );
}
