/**
 * LocationSelector - Unified location selection component
 *
 * Provides multiple ways to select a location:
 * - Google Places search
 * - Manual coordinates input
 * - Saved locations dropdown
 * - Current location (browser geolocation)
 * - Map click (via callback)
 */

import { useState, useRef, useEffect } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import {
  MapPin,
  MagnifyingGlass,
  Crosshair,
  CaretDown,
  BookmarkSimple,
  X,
  NavigationArrow,
} from '@phosphor-icons/react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useGoogleMaps } from './GoogleMapsProvider';
import { useSavedLocations, SavedLocation } from '@/context/SavedLocationsContext';
import { useAuth } from '@/context/AuthContext';

export interface SelectedLocation {
  lat: number;
  lng: number;
  name: string;
}

interface LocationSelectorProps {
  value: SelectedLocation | null;
  onChange: (location: SelectedLocation | null) => void;
  placeholder?: string;
  className?: string;
  showMyLocation?: boolean;
  showSavedLocations?: boolean;
  showCoordinates?: boolean;
  showClear?: boolean;
  compact?: boolean;
  onMapClickHint?: boolean; // Show "or click map" hint
}

// Parse coordinate string like "39.0708, -106.9890" or "39.0708 -106.9890"
function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const cleaned = input.trim();
  if (!cleaned) return null;

  // Try comma-separated first
  let parts = cleaned.split(',').map(s => s.trim());
  if (parts.length !== 2) {
    // Try space-separated
    parts = cleaned.split(/\s+/);
  }
  if (parts.length !== 2) return null;

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

export function LocationSelector({
  value,
  onChange,
  placeholder = "Search location...",
  className = "",
  showMyLocation = true,
  showSavedLocations = true,
  showCoordinates = true,
  showClear = true,
  compact = false,
  onMapClickHint = false,
}: LocationSelectorProps) {
  const { isLoaded } = useGoogleMaps();
  const { user } = useAuth();
  const { locations: savedLocations } = useSavedLocations();

  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [mode, setMode] = useState<'search' | 'coordinates'>('search');
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [coordError, setCoordError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Update input value when external value changes
  useEffect(() => {
    if (value && mode === 'search') {
      setInputValue(value.name);
    }
  }, [value, mode]);

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat = typeof place.geometry.location.lat === 'function'
          ? place.geometry.location.lat()
          : place.geometry.location.lat;
        const lng = typeof place.geometry.location.lng === 'function'
          ? place.geometry.location.lng()
          : place.geometry.location.lng;

        const name = place.name || place.formatted_address || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
        setInputValue(name);
        onChange({ lat, lng, name });
      }
    }
  };

  const handleCoordinateSubmit = () => {
    setCoordError(null);
    const coords = parseCoordinates(inputValue);
    if (coords) {
      onChange({
        lat: coords.lat,
        lng: coords.lng,
        name: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
      });
    } else {
      setCoordError('Invalid coordinates. Use: lat, lng');
    }
  };

  const handleMyLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setInputValue('Current Location');
        onChange({
          lat: latitude,
          lng: longitude,
          name: 'Current Location',
        });
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your location. Please check your permissions.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const handleSavedLocationSelect = (location: SavedLocation) => {
    setInputValue(location.name);
    onChange({
      lat: location.lat,
      lng: location.lng,
      name: location.name,
    });
  };

  const handleClear = () => {
    setInputValue('');
    setCoordError(null);
    onChange(null);
  };

  const toggleMode = () => {
    setMode(mode === 'search' ? 'coordinates' : 'search');
    setInputValue('');
    setCoordError(null);
  };

  if (!isLoaded) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div className="relative flex-1">
          <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input disabled placeholder="Loading..." className="pl-9 h-10" />
        </div>
      </div>
    );
  }

  const iconSize = compact ? "w-3.5 h-3.5" : "w-4 h-4";
  const buttonSize = compact ? "sm" : "default";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Main input area */}
      <div className="relative flex-1">
        {mode === 'search' ? (
          <>
            <MapPin className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${iconSize} text-muted-foreground z-10`} />
            <Autocomplete
              onLoad={onLoad}
              onPlaceChanged={onPlaceChanged}
              options={{
                types: ['establishment', 'geocode'],
                fields: ['place_id', 'name', 'formatted_address', 'geometry', 'types'],
              }}
            >
              <Input
                ref={inputRef}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={placeholder}
                className={`pl-9 pr-8 text-base`}
              />
            </Autocomplete>
          </>
        ) : (
          <>
            <Crosshair className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${iconSize} text-muted-foreground`} />
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => {
                setInputValue(e.target.value);
                setCoordError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCoordinateSubmit();
                }
              }}
              placeholder="lat, lng (e.g. 39.07, -106.99)"
              className={`pl-9 pr-8 text-base ${coordError ? 'border-destructive' : ''}`}
            />
          </>
        )}

        {/* Clear button */}
        {showClear && (value || inputValue) && (
          <button
            onClick={handleClear}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
          >
            <X className={iconSize} />
          </button>
        )}
      </div>

      {/* Mode toggle (search vs coordinates) */}
      {showCoordinates && (
        <Button
          variant="outline"
          size={buttonSize}
          onClick={toggleMode}
          className={`px-2`}
          title={mode === 'search' ? 'Switch to coordinates' : 'Switch to search'}
        >
          {mode === 'search' ? (
            <Crosshair className={iconSize} />
          ) : (
            <MagnifyingGlass className={iconSize} />
          )}
        </Button>
      )}

      {/* My location button */}
      {showMyLocation && (
        <Button
          variant="outline"
          size={buttonSize}
          onClick={handleMyLocation}
          disabled={isGettingLocation}
          className={`px-2`}
          title="Use my location"
        >
          <NavigationArrow className={`${iconSize} ${isGettingLocation ? 'animate-pulse' : ''}`} />
        </Button>
      )}

      {/* Saved locations dropdown */}
      {showSavedLocations && user && savedLocations.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size={buttonSize}
              className={`px-2`}
              title="Saved locations"
            >
              <BookmarkSimple className={iconSize} />
              <CaretDown className="w-3 h-3 ml-0.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Saved Locations</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {savedLocations.slice(0, 10).map((location) => (
              <DropdownMenuItem
                key={location.id}
                onClick={() => handleSavedLocationSelect(location)}
                className="flex items-center gap-2"
              >
                <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{location.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Coordinate submit button (only in coordinates mode) */}
      {mode === 'coordinates' && inputValue && (
        <Button
          size={buttonSize}
          onClick={handleCoordinateSubmit}
        >
          Go
        </Button>
      )}

      {/* Error message */}
      {coordError && (
        <span className="text-xs text-destructive whitespace-nowrap">{coordError}</span>
      )}

      {/* Map click hint */}
      {onMapClickHint && (
        <span className="text-xs text-muted-foreground whitespace-nowrap hidden sm:inline">
          or click map
        </span>
      )}
    </div>
  );
}

export default LocationSelector;
