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
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
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
import { Mono } from '@/components/redesign';
import { cn } from '@/lib/utils';

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
  onMapClickHint?: boolean;
  coordinatesDisplay?: string;
}

function parseCoordinates(input: string): { lat: number; lng: number } | null {
  const cleaned = input.trim();
  if (!cleaned) return null;
  let parts = cleaned.split(',').map((s) => s.trim());
  if (parts.length !== 2) parts = cleaned.split(/\s+/);
  if (parts.length !== 2) return null;

  const lat = parseFloat(parts[0]);
  const lng = parseFloat(parts[1]);

  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { lat, lng };
}

const iconBtnCls = (compact: boolean) =>
  cn(
    'inline-flex items-center justify-center rounded-full border border-line bg-white dark:bg-paper-2 text-ink-2',
    'hover:border-ink-3/50 hover:bg-cream dark:hover:bg-paper-2 transition-colors disabled:opacity-50',
    compact ? 'h-8 px-2' : 'h-10 px-2.5',
  );

export function LocationSelector({
  value,
  onChange,
  placeholder = 'Search location…',
  className = '',
  showMyLocation = true,
  showSavedLocations = true,
  showCoordinates = true,
  showClear = true,
  compact = false,
  onMapClickHint = false,
  coordinatesDisplay,
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

  useEffect(() => {
    if (value && mode === 'search') setInputValue(value.name);
  }, [value, mode]);

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();
      if (place.geometry?.location) {
        const lat =
          typeof place.geometry.location.lat === 'function'
            ? place.geometry.location.lat()
            : place.geometry.location.lat;
        const lng =
          typeof place.geometry.location.lng === 'function'
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
        onChange({ lat: latitude, lng: longitude, name: 'Current Location' });
        setIsGettingLocation(false);
      },
      (error) => {
        console.error('Geolocation error:', error);
        alert('Unable to get your location. Please check your permissions.');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const handleSavedLocationSelect = (location: SavedLocation) => {
    setInputValue(location.name);
    onChange({ lat: location.lat, lng: location.lng, name: location.name });
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
      <div className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`}>
        <div className="relative flex-1 w-full">
          <MagnifyingGlass className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-ink-3" />
          <Input disabled placeholder="Loading…" className="pl-9 h-10" />
        </div>
      </div>
    );
  }

  const iconSize = compact ? 'w-3.5 h-3.5' : 'w-4 h-4';

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 ${className}`}>
      {/* Main input area */}
      <div className="relative flex-1 w-full">
        {mode === 'search' ? (
          <>
            <MapPin className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${iconSize} text-ink-3 z-10`} />
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
                className="pl-9 pr-9"
              />
            </Autocomplete>
          </>
        ) : (
          <>
            <Crosshair className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${iconSize} text-ink-3`} />
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
              className={cn('pl-9 pr-9', coordError && '!border-ember')}
            />
          </>
        )}

        {showClear && (value || inputValue) && (
          <button
            onClick={handleClear}
            aria-label="Clear"
            className="absolute right-2 top-1/2 transform -translate-y-1/2 inline-flex items-center justify-center w-6 h-6 rounded-full text-ink-3 hover:text-ink hover:bg-cream dark:hover:bg-paper-2 transition-colors"
          >
            <X className={iconSize} weight="regular" />
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1.5 sm:gap-2">
        {showCoordinates && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={toggleMode} className={iconBtnCls(compact)} aria-label="Toggle input mode">
                {mode === 'search' ? (
                  <Crosshair className={iconSize} weight="regular" />
                ) : (
                  <MagnifyingGlass className={iconSize} weight="regular" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent>{mode === 'search' ? 'Enter coordinates' : 'Search by name'}</TooltipContent>
          </Tooltip>
        )}

        {showMyLocation && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={handleMyLocation}
                disabled={isGettingLocation}
                className={iconBtnCls(compact)}
                aria-label="Use my location"
              >
                <NavigationArrow
                  className={cn(iconSize, isGettingLocation && 'animate-pulse text-pine-6')}
                  weight="regular"
                />
              </button>
            </TooltipTrigger>
            <TooltipContent>Use my location</TooltipContent>
          </Tooltip>
        )}

        {showSavedLocations && user && savedLocations.length > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={iconBtnCls(compact)} aria-label="Saved locations">
                    <BookmarkSimple className={iconSize} weight="regular" />
                    <CaretDown className="w-3 h-3 ml-0.5" weight="regular" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-64 rounded-[12px] border-line bg-white [&_[data-highlighted]]:bg-cream dark:bg-paper-2 [&_[data-highlighted]]:text-ink"
                >
                  <DropdownMenuLabel>
                    <Mono className="text-ink-2">Saved locations</Mono>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator className="bg-line" />
                  {savedLocations.slice(0, 10).map((location) => (
                    <DropdownMenuItem
                      key={location.id}
                      onClick={() => handleSavedLocationSelect(location)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      <MapPin className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" weight="regular" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-sans font-semibold tracking-[-0.005em] text-ink truncate">
                          {location.name}
                        </div>
                        <Mono className="text-ink-3 truncate block">
                          {location.lat.toFixed(4)}, {location.lng.toFixed(4)}
                        </Mono>
                      </div>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </TooltipTrigger>
            <TooltipContent>Saved locations</TooltipContent>
          </Tooltip>
        )}

        {mode === 'coordinates' && inputValue && (
          <button
            onClick={handleCoordinateSubmit}
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-pine-6 text-cream dark:text-ink-pine border border-pine-6 hover:bg-pine-5 hover:border-pine-5 transition-colors px-3 font-sans font-semibold text-[12px] tracking-[0.01em]',
              compact ? 'h-8' : 'h-10',
            )}
          >
            Go
          </button>
        )}

        {coordError && (
          <Mono className="text-ember whitespace-nowrap">{coordError}</Mono>
        )}

        {onMapClickHint && (
          <Mono className="text-ink-3 whitespace-nowrap hidden sm:inline">or click map</Mono>
        )}

        {coordinatesDisplay && (
          <Mono className="text-ink-3 whitespace-nowrap ml-auto">{coordinatesDisplay}</Mono>
        )}
      </div>
    </div>
  );
}

export default LocationSelector;
