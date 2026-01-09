import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Plus, X, Compass, Calendar, RotateCcw, Loader2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Autocomplete } from '@react-google-maps/api';
import { useTrip } from '@/context/TripContext';
import { useTripGenerator } from '@/hooks/use-trip-generator';
import { TripDestination } from '@/types/trip';

const CreateTrip = () => {
  const navigate = useNavigate();
  const { setTripConfig, setGeneratedTrip } = useTrip();
  const { generateTrip, generating, error } = useTripGenerator();

  const [tripName, setTripName] = useState('');
  const [duration, setDuration] = useState(3);
  const [startLocation, setStartLocation] = useState<TripDestination | null>(null);
  const [destinations, setDestinations] = useState<TripDestination[]>([]);
  const [returnToStart, setReturnToStart] = useState(false);

  const [startAutocomplete, setStartAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const [destAutocomplete, setDestAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  const handleStartPlaceChanged = () => {
    if (startAutocomplete) {
      const place = startAutocomplete.getPlace();
      if (place.geometry?.location && place.place_id) {
        setStartLocation({
          id: `start-${Date.now()}`,
          placeId: place.place_id,
          name: place.name || '',
          address: place.formatted_address || '',
          coordinates: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          },
        });
      }
    }
  };

  const handleDestPlaceChanged = () => {
    if (destAutocomplete) {
      const place = destAutocomplete.getPlace();
      if (place.geometry?.location && place.place_id) {
        const newDest: TripDestination = {
          id: `dest-${Date.now()}`,
          placeId: place.place_id,
          name: place.name || '',
          address: place.formatted_address || '',
          coordinates: {
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
          },
        };
        setDestinations([...destinations, newDest]);
        // Clear the input
        const input = document.getElementById('dest-input') as HTMLInputElement;
        if (input) input.value = '';
      }
    }
  };

  const removeDestination = (id: string) => {
    setDestinations(destinations.filter((d) => d.id !== id));
  };

  const handleGenerateTrip = async () => {
    if (!startLocation) return;

    const config = {
      name: tripName || 'My Adventure',
      duration,
      startLocation,
      destinations,
      returnToStart,
    };

    setTripConfig(config);

    const trip = await generateTrip(config);
    if (trip) {
      setGeneratedTrip(trip);
      navigate(`/trip/${trip.id}`);
    }
  };

  const canGenerate = startLocation && destinations.length > 0;

  return (
    <div className="min-h-screen bg-background topo-pattern">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon" className="rounded-full">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-display font-bold text-foreground">Create Trip</h1>
              <p className="text-sm text-muted-foreground">Plan your next adventure</p>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 max-w-2xl mx-auto">
        <div className="space-y-6">
          {/* Trip Name */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-2">
                <Label htmlFor="trip-name">Trip Name</Label>
                <Input
                  id="trip-name"
                  placeholder="e.g., Eastern Sierra Adventure"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Duration */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-primary" />
                  <Label>Trip Duration</Label>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDuration(Math.max(1, duration - 1))}
                    disabled={duration <= 1}
                  >
                    -
                  </Button>
                  <div className="flex-1 text-center">
                    <span className="text-3xl font-bold text-foreground">{duration}</span>
                    <span className="text-muted-foreground ml-2">
                      {duration === 1 ? 'day' : 'days'}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setDuration(Math.min(14, duration + 1))}
                    disabled={duration >= 14}
                  >
                    +
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground text-center">
                  {duration === 1
                    ? 'A quick day trip'
                    : duration <= 3
                    ? 'A weekend getaway'
                    : duration <= 7
                    ? 'A week-long adventure'
                    : 'An extended expedition'}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Start Location */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Compass className="w-5 h-5 text-primary" />
                  <Label>Starting Point</Label>
                </div>
                {startLocation ? (
                  <div className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg">
                    <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-lg">
                      <MapPin className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-foreground truncate">{startLocation.name}</p>
                      <p className="text-sm text-muted-foreground truncate">{startLocation.address}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="flex-shrink-0"
                      onClick={() => setStartLocation(null)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Autocomplete
                    onLoad={setStartAutocomplete}
                    onPlaceChanged={handleStartPlaceChanged}
                  >
                    <Input placeholder="Search for starting location..." />
                  </Autocomplete>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Destinations */}
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-terracotta" />
                    <Label>Destinations</Label>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {destinations.length} {destinations.length === 1 ? 'stop' : 'stops'}
                  </span>
                </div>

                {/* Destination List */}
                {destinations.length > 0 && (
                  <div className="space-y-2">
                    {destinations.map((dest, index) => (
                      <div
                        key={dest.id}
                        className="flex items-center gap-3 p-3 bg-secondary/50 rounded-lg group"
                      >
                        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
                        <div className="flex items-center justify-center w-8 h-8 bg-terracotta/10 rounded-full">
                          <span className="text-sm font-medium text-terracotta">{index + 1}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground truncate">{dest.name}</p>
                          <p className="text-sm text-muted-foreground truncate">{dest.address}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeDestination(dest.id)}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add Destination */}
                <Autocomplete onLoad={setDestAutocomplete} onPlaceChanged={handleDestPlaceChanged}>
                  <div className="relative">
                    <Input id="dest-input" placeholder="Add a destination..." className="pr-10" />
                    <Plus className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  </div>
                </Autocomplete>

                {destinations.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Add at least one destination to generate your trip
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Options */}
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <RotateCcw className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <Label>Return to Start</Label>
                    <p className="text-sm text-muted-foreground">
                      End the trip back where you started
                    </p>
                  </div>
                </div>
                <Switch checked={returnToStart} onCheckedChange={setReturnToStart} />
              </div>
            </CardContent>
          </Card>

          {/* Error */}
          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          {/* Generate Button */}
          <Button
            variant="hero"
            size="lg"
            className="w-full"
            onClick={handleGenerateTrip}
            disabled={!canGenerate || generating}
          >
            {generating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating Trip...
              </>
            ) : (
              <>
                <Compass className="w-5 h-5 mr-2" />
                Generate Trip
              </>
            )}
          </Button>

          {!canGenerate && (
            <p className="text-sm text-muted-foreground text-center">
              Add a starting point and at least one destination to continue
            </p>
          )}
        </div>
      </main>
    </div>
  );
};

export default CreateTrip;
