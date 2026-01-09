import { Search, MapPin, Plus, X } from "lucide-react";
import { useState } from "react";
import { useLoadScript, Autocomplete } from "@react-google-maps/api";
import { PlaceResult } from "@/types/maps";
import { useSavedLocations } from "@/context/SavedLocationsContext";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const libraries: ("places")[] = ["places"];

interface SearchBarProps {
  onPlaceSelect?: (place: PlaceResult) => void;
}

export const SearchBar = ({ onPlaceSelect }: SearchBarProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [selectedPlace, setSelectedPlace] = useState<PlaceResult | null>(null);

  const { addLocation, isLocationSaved } = useSavedLocations();

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
        const result: PlaceResult = {
          placeId: place.place_id,
          name: place.name || "",
          address: place.formatted_address || "",
          coordinates: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          },
        };

        setSelectedPlace(result);

        if (onPlaceSelect) {
          onPlaceSelect(result);
        }
      }
    }
  };

  const handleSaveLocation = () => {
    if (!selectedPlace) return;

    const added = addLocation({
      placeId: selectedPlace.placeId,
      name: selectedPlace.name,
      address: selectedPlace.address,
      type: "Saved Place",
      lat: selectedPlace.coordinates.lat,
      lng: selectedPlace.coordinates.lng,
    });

    if (added) {
      toast.success(`Saved ${selectedPlace.name}`, {
        description: "Added to your saved locations",
      });
    } else {
      toast.info("Already saved", {
        description: "This location is already in your saved places",
      });
    }

    setSelectedPlace(null);
  };

  const handleDismiss = () => {
    setSelectedPlace(null);
  };

  const alreadySaved = selectedPlace ? isLocationSaved(selectedPlace.placeId) : false;

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
            <Search className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Selected Place Popup */}
      {selectedPlace && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-card border border-border rounded-xl shadow-lg p-4 z-50 animate-fade-in">
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 text-muted-foreground hover:text-foreground"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-start gap-3 pr-6">
            <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg flex-shrink-0">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-foreground">{selectedPlace.name}</h3>
              <p className="text-sm text-muted-foreground mt-0.5 truncate">
                {selectedPlace.address}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button
              onClick={handleSaveLocation}
              variant={alreadySaved ? "outline" : "hero"}
              size="sm"
              className="flex-1 gap-2"
              disabled={alreadySaved}
            >
              <Plus className="w-4 h-4" />
              {alreadySaved ? "Already Saved" : "Save Location"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
