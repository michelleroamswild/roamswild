import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Autocomplete } from "@react-google-maps/api";
import { useGoogleMaps } from "./GoogleMapsProvider";
import { useRecentSearches } from "@/hooks/use-recent-searches";

export const SearchBar = () => {
  const { addSearch } = useRecentSearches();
  const [isFocused, setIsFocused] = useState(false);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const navigate = useNavigate();

  const { isLoaded } = useGoogleMaps();

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.place_id) {
        // Save to recent searches (uses Supabase if logged in, localStorage otherwise)
        addSearch({
          placeId: place.place_id,
          name: place.name || "",
          address: place.formatted_address || "",
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
        });

        // Navigate to location detail with place data in state
        navigate(`/location/${place.place_id}`, {
          state: {
            placeId: place.place_id,
            name: place.name || "",
            address: place.formatted_address || "",
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          }
        });
      }
    }
  };

  return (
    <div className="relative w-full max-w-3xl mx-auto">
      <div
        className={`
          transition-all duration-300
          ${isFocused ? 'scale-[1.02]' : 'scale-100'}
        `}
      >
        <div
          className={`
            flex items-center gap-4 bg-input dark:bg-primary border rounded-lg px-5 py-4
            transition-all duration-300
            ${isFocused ? 'border-ring ring-2 ring-ring/20' : 'border-border dark:border-transparent'}
          `}
        >
          <MapPin className="w-6 h-6 text-primary dark:text-primary-foreground flex-shrink-0" />
          {isLoaded ? (
            <Autocomplete
              onLoad={onLoad}
              onPlaceChanged={onPlaceChanged}
              options={{
                types: ["establishment", "geocode"],
                fields: ["place_id", "name", "formatted_address", "geometry"],
              }}
              className="flex-1"
            >
              <input
                type="text"
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder="Search destinations, trails, or campsites..."
                className="w-full bg-transparent text-foreground dark:text-primary-foreground placeholder:text-muted-foreground dark:placeholder:text-primary-foreground/60 text-lg md:text-xl outline-none"
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              disabled
              placeholder="Loading search..."
              className="flex-1 bg-transparent text-foreground dark:text-primary-foreground placeholder:text-muted-foreground dark:placeholder:text-primary-foreground/60 text-lg md:text-xl outline-none"
            />
          )}
          <button className="flex items-center justify-center w-14 h-14 bg-primary dark:bg-primary-foreground text-primary-foreground dark:text-primary rounded-lg hover:bg-forest-light dark:hover:bg-primary-foreground/90 transition-colors duration-200 shadow-sm">
            <MagnifyingGlass className="w-6 h-6" weight="bold" />
          </button>
        </div>
      </div>
    </div>
  );
};
