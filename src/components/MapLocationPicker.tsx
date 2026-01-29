import { useState, useCallback } from "react";
import { Marker } from "@react-google-maps/api";
import { MapPin, MagnifyingGlass, Crosshair } from "@phosphor-icons/react";
import { GoogleMap } from "@/components/GoogleMap";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const defaultCenter = initialCenter || { lat: 39.8283, lng: -98.5795 }; // Center of US as fallback
  const defaultZoom = initialCenter ? 10 : 4;
  const [mapCenter, setMapCenter] = useState<google.maps.LatLngLiteral>(defaultCenter);
  const [mapZoom, setMapZoom] = useState(defaultZoom);
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(null);
  const [locationName, setLocationName] = useState("");
  const [map, setMap] = useState<google.maps.Map | null>(null);

  const handleMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      setSelectedLocation({ lat, lng });
      setLocationName("");
    }
  }, []);

  const handlePlaceSelect = useCallback((place: google.maps.places.PlaceResult) => {
    if (place.geometry?.location) {
      const lat = place.geometry.location.lat();
      const lng = place.geometry.location.lng();
      setSelectedLocation({ lat, lng, name: place.name });
      setLocationName(place.name || "");
      setMapCenter({ lat, lng });
      setMapZoom(12);
    }
  }, []);

  const handleConfirm = () => {
    if (selectedLocation) {
      const name = locationName.trim() ||
        `Location (${selectedLocation.lat.toFixed(4)}, ${selectedLocation.lng.toFixed(4)})`;
      onSelectLocation({
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        name,
      });
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
          setLocationName("");
        },
        (error) => {
          console.error("Error getting location:", error);
        }
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search bar */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center gap-2">
          <MagnifyingGlass className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Search for a location</span>
        </div>
        <PlaceSearch
          onPlaceSelect={handlePlaceSelect}
          placeholder="Search places..."
        />
        <Button
          variant="outline"
          size="sm"
          onClick={handleUseCurrentLocation}
          className="w-full"
        >
          <Crosshair className="w-4 h-4 mr-2" />
          Use my current location
        </Button>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <GoogleMap
          center={mapCenter}
          zoom={mapZoom}
          onClick={handleMapClick}
          onLoad={setMap}
          className="w-full h-full"
        >
          {selectedLocation && (
            <Marker
              position={{ lat: selectedLocation.lat, lng: selectedLocation.lng }}
              animation={google.maps.Animation.DROP}
            />
          )}
        </GoogleMap>

        {/* Click hint overlay */}
        {!selectedLocation && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-background/90 backdrop-blur-sm px-4 py-2 rounded-full shadow-lg border border-border">
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <MapPin className="w-4 h-4" />
              Click on the map to drop a pin
            </p>
          </div>
        )}
      </div>

      {/* Selected location details */}
      {selectedLocation && (
        <div className="p-4 border-t border-border space-y-3 bg-muted/30">
          <div className="flex items-center gap-2 text-sm">
            <MapPin className="w-4 h-4 text-primary" weight="fill" />
            <span className="text-muted-foreground">
              {selectedLocation.lat.toFixed(6)}, {selectedLocation.lng.toFixed(6)}
            </span>
          </div>

          <div className="space-y-2">
            <Label htmlFor="location-name" className="text-xs">Location name</Label>
            <Input
              id="location-name"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              placeholder="Enter a name for this location"
            />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" onClick={onCancel} className="flex-1">
              Cancel
            </Button>
            <Button variant="primary" onClick={handleConfirm} className="flex-1">
              <MapPin className="w-4 h-4 mr-2" />
              Add Location
            </Button>
          </div>
        </div>
      )}

      {/* Cancel button when no location selected */}
      {!selectedLocation && (
        <div className="p-4 border-t border-border">
          <Button variant="outline" onClick={onCancel} className="w-full">
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
