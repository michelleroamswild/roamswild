import { MagnifyingGlass, MapPin } from "@phosphor-icons/react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";

const libraries: ("places")[] = ["places"];

export const SearchBar = () => {
  const [isFocused, setIsFocused] = useState(false);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const navigate = useNavigate();

  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const onLoad = (autocompleteInstance: google.maps.places.Autocomplete) => {
    setAutocomplete(autocompleteInstance);
  };

  const onPlaceChanged = () => {
    if (autocomplete) {
      const place = autocomplete.getPlace();

      if (place.geometry?.location && place.place_id) {
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
    <div className="relative w-full max-w-2xl mx-auto">
      <div
        className={`
          transition-all duration-300
          ${isFocused ? 'scale-[1.02]' : 'scale-100'}
        `}
      >
        <div
          className={`
            flex items-center gap-3 bg-card border-2 rounded-2xl px-5 py-4
            shadow-search transition-all duration-300
            ${isFocused ? 'border-primary shadow-card-hover' : 'border-transparent'}
          `}
        >
          <MapPin className="w-5 h-5 text-terracotta flex-shrink-0" />
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
                className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-lg outline-none"
              />
            </Autocomplete>
          ) : (
            <input
              type="text"
              disabled
              placeholder="Loading search..."
              className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground text-lg outline-none"
            />
          )}
          <button className="flex items-center justify-center w-12 h-12 bg-primary text-primary-foreground rounded-xl hover:bg-forest-light transition-colors duration-200 shadow-sm">
            <MagnifyingGlass className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
