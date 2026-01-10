import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  X,
  Route,
  Clock,
  Mountain,
  Tent,
  Fuel,
  MapPin,
  Navigation,
  Share2,
  Heart,
  Star,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Footprints,
  Eye,
  Trash2,
  RefreshCw,
  Flame,
  Camera,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, InfoWindow, DirectionsRenderer } from '@react-google-maps/api';
import { TripStop, TripDay } from '@/types/trip';
import { toast } from 'sonner';
import { AlternativeHikesModal } from '@/components/AlternativeHikesModal';
import { usePhotoHotspots, PhotoHotspot } from '@/hooks/use-photo-hotspots';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

const getIcon = (type: string) => {
  switch (type) {
    case 'hike':
      return Footprints;
    case 'gas':
      return Fuel;
    case 'camp':
      return Tent;
    case 'viewpoint':
      return Eye;
    default:
      return MapPin;
  }
};

const getTypeStyles = (type: string) => {
  switch (type) {
    case 'hike':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'gas':
      return 'bg-terracotta/10 text-terracotta border-terracotta/20';
    case 'camp':
      return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    case 'viewpoint':
      return 'bg-primary/10 text-primary border-primary/20';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
};

const getMarkerColor = (type: string) => {
  switch (type) {
    case 'hike':
      return '#10b981';
    case 'camp':
      return '#f59e0b';
    case 'viewpoint':
      return '#2d5a3d';
    default:
      return '#6b7280';
  }
};

const TripDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { generatedTrip, tripConfig, saveTrip, deleteSavedTrip, isTripSaved, loadSavedTrip, updateTripStop, removeTripStop } = useTrip();

  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const [selectedStop, setSelectedStop] = useState<TripStop | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [dayDirections, setDayDirections] = useState<google.maps.DirectionsResult | null>(null);
  const [activeDay, setActiveDay] = useState<number | null>(null);
  const [hikeModalOpen, setHikeModalOpen] = useState(false);
  const [selectedHikeForSwap, setSelectedHikeForSwap] = useState<TripStop | null>(null);
  const [showPhotoHotspots, setShowPhotoHotspots] = useState(true);
  const [selectedPhotoHotspot, setSelectedPhotoHotspot] = useState<PhotoHotspot | null>(null);

  // Calculate center point of trip for photo hotspots search
  const tripCenter = generatedTrip ? (() => {
    const allStops = generatedTrip.days.flatMap(day => day.stops);
    if (allStops.length === 0) return { lat: 0, lng: 0 };
    const sumLat = allStops.reduce((sum, stop) => sum + stop.coordinates.lat, 0);
    const sumLng = allStops.reduce((sum, stop) => sum + stop.coordinates.lng, 0);
    return {
      lat: sumLat / allStops.length,
      lng: sumLng / allStops.length,
    };
  })() : { lat: 0, lng: 0 };

  // Fetch photo hotspots near the trip route
  const { hotspots: photoHotspots, loading: loadingPhotoHotspots } = usePhotoHotspots(
    tripCenter.lat,
    tripCenter.lng,
    80 // 80km radius to cover trip area
  );

  // Check if this trip is saved
  const isSaved = generatedTrip ? isTripSaved(generatedTrip.id) : false;

  // Try to load saved trip if no generated trip
  useEffect(() => {
    if (!generatedTrip && id) {
      const loaded = loadSavedTrip(id);
      if (!loaded) {
        navigate('/create-trip');
      }
    }
  }, [id, generatedTrip, loadSavedTrip, navigate]);

  const handleSaveTrip = () => {
    if (generatedTrip) {
      saveTrip(generatedTrip);
      toast.success('Trip saved!', {
        description: 'You can find it in My Trips',
      });
    }
  };

  const handleUnsaveTrip = () => {
    if (generatedTrip) {
      deleteSavedTrip(generatedTrip.id);
      toast.success('Trip removed', {
        description: 'Removed from your saved trips',
      });
    }
  };

  const handleOpenHikeSwap = (hike: TripStop) => {
    setSelectedHikeForSwap(hike);
    setHikeModalOpen(true);
  };

  const handleSwapHike = (newHike: TripStop) => {
    if (selectedHikeForSwap) {
      updateTripStop(selectedHikeForSwap.day, selectedHikeForSwap.id, newHike);
      toast.success('Hike updated!', {
        description: `Changed to ${newHike.name}`,
      });
    }
  };

  const handleRemoveStop = (dayNumber: number, stop: TripStop) => {
    removeTripStop(dayNumber, stop.id);
    toast.success('Stop removed', {
      description: `Removed ${stop.name} from Day ${dayNumber}`,
    });
  };

  // Start a specific day - show its route on the map
  const handleStartDay = (dayNumber: number) => {
    if (!mapsLoaded || !generatedTrip) return;

    const day = generatedTrip.days.find(d => d.day === dayNumber);
    if (!day || day.stops.length === 0) return;

    // Set active day and expand it
    setActiveDay(dayNumber);
    setExpandedDays(prev => prev.includes(dayNumber) ? prev : [...prev, dayNumber]);

    // Get stops in order for this day
    const dayStops = day.stops;
    if (dayStops.length < 2) {
      // Not enough stops for a route, just center on the stop
      setDayDirections(null);
      return;
    }

    const directionsService = new google.maps.DirectionsService();

    // First stop is origin, last stop is destination
    const origin = dayStops[0].coordinates;
    const destination = dayStops[dayStops.length - 1].coordinates;

    // Middle stops are waypoints
    const waypoints = dayStops.slice(1, -1).map(stop => ({
      location: stop.coordinates,
      stopover: true,
    }));

    directionsService.route(
      {
        origin,
        destination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDayDirections(result);
        }
      }
    );

    toast.success(`Day ${dayNumber} started`, {
      description: 'Showing route on map',
    });
  };

  // Exit day mode and show full trip
  const handleExitDayMode = () => {
    setActiveDay(null);
    setDayDirections(null);
  };

  // Fetch driving directions when map loads
  useEffect(() => {
    if (!mapsLoaded || !tripConfig || tripConfig.destinations.length === 0) {
      return;
    }

    const directionsService = new google.maps.DirectionsService();

    const origin = tripConfig.startLocation.coordinates;
    const finalDestination = tripConfig.returnToStart
      ? tripConfig.startLocation.coordinates
      : tripConfig.destinations[tripConfig.destinations.length - 1].coordinates;

    // Build waypoints from all destinations (except the last one if not returning to start)
    const waypointDestinations = tripConfig.returnToStart
      ? tripConfig.destinations
      : tripConfig.destinations.slice(0, -1);

    const waypoints = waypointDestinations.map((dest) => ({
      location: dest.coordinates,
      stopover: true,
    }));

    directionsService.route(
      {
        origin,
        destination: finalDestination,
        waypoints,
        travelMode: google.maps.TravelMode.DRIVING,
        optimizeWaypoints: false,
      },
      (result, status) => {
        if (status === google.maps.DirectionsStatus.OK && result) {
          setDirections(result);
        }
      }
    );
  }, [mapsLoaded, tripConfig]);

  if (!generatedTrip || !tripConfig) {
    return null;
  }

  const toggleDay = (day: number) => {
    setExpandedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  // Calculate map center and all stops
  const allStops = generatedTrip.days.flatMap((day) => day.stops);
  const mapCenter = allStops.length > 0
    ? {
        lat: allStops.reduce((sum, s) => sum + s.coordinates.lat, 0) / allStops.length,
        lng: allStops.reduce((sum, s) => sum + s.coordinates.lng, 0) / allStops.length,
      }
    : tripConfig.startLocation.coordinates;

  const handleStartNavigation = () => {
    const waypoints = tripConfig.destinations
      .slice(0, -1)
      .map((d) => `${d.coordinates.lat},${d.coordinates.lng}`)
      .join('|');
    const origin = `${tripConfig.startLocation.coordinates.lat},${tripConfig.startLocation.coordinates.lng}`;
    const dest = tripConfig.destinations.length > 0
      ? `${tripConfig.destinations[tripConfig.destinations.length - 1].coordinates.lat},${tripConfig.destinations[tripConfig.destinations.length - 1].coordinates.lng}`
      : origin;
    window.open(
      `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`,
      '_blank'
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <X className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">
                  {tripConfig.name || 'My Trip'}
                </h1>
                <p className="text-sm text-muted-foreground">
                  {generatedTrip.days.length} days • {generatedTrip.totalDistance}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isSaved ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleUnsaveTrip}
                >
                  <Heart className="w-4 h-4 mr-1.5 text-terracotta fill-terracotta" />
                  Saved
                </Button>
              ) : (
                <Button
                  variant="hero"
                  size="sm"
                  onClick={handleSaveTrip}
                >
                  <Heart className="w-4 h-4 mr-1.5" />
                  Save Trip
                </Button>
              )}
              <Button variant="ghost" size="icon" className="rounded-full">
                <Share2 className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-6">
        <div className="grid lg:grid-cols-5 gap-6">
          {/* Map Section */}
          <div className="lg:col-span-3 order-2 lg:order-1">
            <Card className="overflow-hidden h-[400px] lg:h-[calc(100vh-180px)] lg:sticky lg:top-24">
              <div className="relative w-full h-full">
                <GoogleMap
                  center={activeDay && dayDirections ? undefined : mapCenter}
                  zoom={activeDay ? 10 : 8}
                  className="w-full h-full"
                  onLoad={() => setMapsLoaded(true)}
                >
                  {/* Day-specific route when a day is active */}
                  {activeDay && dayDirections && (
                    <DirectionsRenderer
                      directions={dayDirections}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: '#10b981',
                          strokeWeight: 5,
                          strokeOpacity: 1,
                        },
                      }}
                    />
                  )}

                  {/* Full trip route (shown when no day is active) */}
                  {!activeDay && directions && (
                    <DirectionsRenderer
                      directions={directions}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: '#2d5a3d',
                          strokeWeight: 4,
                          strokeOpacity: 0.8,
                        },
                      }}
                    />
                  )}

                  {/* Start marker (only shown when viewing full trip) */}
                  {!activeDay && (
                    <Marker
                      position={tripConfig.startLocation.coordinates}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#2d5a3d',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                        scale: 10,
                      }}
                      title={`Start: ${tripConfig.startLocation.name}`}
                    />
                  )}

                  {/* Show only active day's stops when day is selected, otherwise all stops */}
                  {(activeDay ? generatedTrip.days.find(d => d.day === activeDay)?.stops || [] : allStops).map((stop, index) => (
                    <Marker
                      key={stop.id}
                      position={stop.coordinates}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: getMarkerColor(stop.type),
                        fillOpacity: 1,
                        strokeColor: activeDay ? '#000000' : '#ffffff',
                        strokeWeight: activeDay ? 3 : 2,
                        scale: activeDay ? 10 : 8,
                      }}
                      label={activeDay ? {
                        text: String(index + 1),
                        color: '#ffffff',
                        fontSize: '12px',
                        fontWeight: 'bold',
                      } : undefined}
                      title={stop.name}
                      onClick={() => setSelectedStop(stop)}
                    />
                  ))}

                  {/* Photo hotspot markers */}
                  {showPhotoHotspots && photoHotspots.map((hotspot) => (
                    <Marker
                      key={hotspot.id}
                      position={{ lat: hotspot.lat, lng: hotspot.lng }}
                      icon={{
                        url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
                            <circle cx="16" cy="16" r="14" fill="#f97316" stroke="#ffffff" stroke-width="2"/>
                            <path d="M16 8c-1.5 3-3 5-3 8 0 3 1.5 5 3 6 1.5-1 3-3 3-6 0-3-1.5-5-3-8z" fill="#ffffff"/>
                            <circle cx="16" cy="18" r="2" fill="#f97316"/>
                          </svg>
                        `)}`,
                        scaledSize: new google.maps.Size(28, 28),
                        anchor: new google.maps.Point(14, 14),
                      }}
                      title={`${hotspot.name} (${hotspot.photoCount} photos)`}
                      onClick={() => {
                        setSelectedStop(null);
                        setSelectedPhotoHotspot(hotspot);
                      }}
                    />
                  ))}

                  {/* Info window for selected photo hotspot */}
                  {selectedPhotoHotspot && (
                    <InfoWindow
                      position={{ lat: selectedPhotoHotspot.lat, lng: selectedPhotoHotspot.lng }}
                      onCloseClick={() => setSelectedPhotoHotspot(null)}
                    >
                      <div className="p-1 min-w-[180px]">
                        <div className="flex items-center gap-2 mb-2">
                          <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                            <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M10 2c-1.5 3-4 6-4 10 0 4 2 6 4 7 2-1 4-3 4-7 0-4-2.5-7-4-10z"/>
                            </svg>
                          </div>
                          <span className="text-xs font-medium text-orange-600">Photo Hotspot</span>
                        </div>
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedPhotoHotspot.name}
                        </h4>
                        <p className="text-gray-600 text-sm mb-3">
                          {selectedPhotoHotspot.photoCount.toLocaleString()} photos taken here
                        </p>
                        <button
                          onClick={() => {
                            window.open(
                              `https://www.flickr.com/search/?lat=${selectedPhotoHotspot.lat}&lon=${selectedPhotoHotspot.lng}&radius=1`,
                              '_blank'
                            );
                          }}
                          className="w-full px-3 py-1.5 bg-orange-500 text-white text-sm rounded hover:bg-orange-600 transition-colors"
                        >
                          View on Flickr
                        </button>
                      </div>
                    </InfoWindow>
                  )}

                  {/* Info window for selected stop */}
                  {selectedStop && (
                    <InfoWindow
                      position={selectedStop.coordinates}
                      onCloseClick={() => setSelectedStop(null)}
                    >
                      <div className="p-1 min-w-[200px]">
                        <h4 className="font-semibold text-gray-900 text-base mb-1">
                          {selectedStop.name}
                        </h4>
                        <p className="text-gray-600 text-sm mb-2">{selectedStop.description}</p>
                        <div className="flex items-center gap-2 text-gray-500 text-sm mb-3">
                          <span>Day {selectedStop.day}</span>
                          <span>•</span>
                          <span>{selectedStop.duration}</span>
                        </div>
                        <button
                          onClick={() => {
                            window.open(
                              `https://www.google.com/maps/dir/?api=1&destination=${selectedStop.coordinates.lat},${selectedStop.coordinates.lng}`,
                              '_blank'
                            );
                          }}
                          className="w-full px-3 py-1.5 bg-emerald-600 text-white text-sm rounded hover:bg-emerald-700 transition-colors"
                        >
                          Get Directions
                        </button>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>

                {/* Route info overlay */}
                <div className="absolute bottom-4 left-4 right-4 z-10">
                  <div className="bg-card/95 backdrop-blur-sm rounded-xl border border-border p-4 shadow-lg">
                    {activeDay ? (
                      // Day-specific info
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center justify-center w-10 h-10 bg-emerald-500/10 rounded-full">
                            <span className="text-lg font-bold text-emerald-600">{activeDay}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">Day {activeDay}</p>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span className="flex items-center gap-1">
                                <Route className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.drivingDistance}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.drivingTime}
                              </span>
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {generatedTrip.days.find(d => d.day === activeDay)?.stops.length} stops
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={handleExitDayMode}>
                            <X className="w-4 h-4 mr-1" />
                            Exit Day
                          </Button>
                          <Button variant="hero" size="sm" onClick={() => {
                            const day = generatedTrip.days.find(d => d.day === activeDay);
                            if (day && day.stops.length > 0) {
                              const stops = day.stops;
                              const waypoints = stops.slice(1, -1)
                                .map(s => `${s.coordinates.lat},${s.coordinates.lng}`)
                                .join('|');
                              const origin = `${stops[0].coordinates.lat},${stops[0].coordinates.lng}`;
                              const dest = `${stops[stops.length - 1].coordinates.lat},${stops[stops.length - 1].coordinates.lng}`;
                              window.open(
                                `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`,
                                '_blank'
                              );
                            }
                          }}>
                            <Navigation className="w-4 h-4 mr-2" />
                            Navigate Day {activeDay}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      // Full trip info
                      <div className="flex items-center justify-between flex-wrap gap-4">
                        <div className="flex items-center gap-6">
                          <div className="flex items-center gap-2">
                            <Route className="w-4 h-4 text-terracotta" />
                            <span className="font-semibold text-foreground">
                              {generatedTrip.totalDistance}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 text-muted-foreground" />
                            <span className="text-foreground">{generatedTrip.totalDrivingTime}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="text-foreground">{generatedTrip.days.length} days</span>
                          </div>
                        </div>
                        <Button variant="hero" size="sm" onClick={handleStartNavigation}>
                          <Navigation className="w-4 h-4 mr-2" />
                          Start Navigation
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Itinerary Panel */}
          <div className="lg:col-span-2 order-1 lg:order-2 space-y-4">
            {/* Trip Summary */}
            <Card className="bg-gradient-card">
              <CardContent className="p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {generatedTrip.totalDistance.replace(' mi', '')}
                    </p>
                    <p className="text-xs text-muted-foreground">Total Miles</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {generatedTrip.totalDrivingTime.split('h')[0]}h
                    </p>
                    <p className="text-xs text-muted-foreground">Drive Time</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">{generatedTrip.days.length}</p>
                    <p className="text-xs text-muted-foreground">Days</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Photo Hotspots */}
            {photoHotspots.length > 0 && (
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-orange-500" />
                      <h3 className="font-semibold text-foreground">Photo Hotspots</h3>
                      <span className="text-xs text-muted-foreground">via Flickr</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor="show-hotspots" className="text-sm text-muted-foreground">
                        Show on map
                      </Label>
                      <Switch
                        id="show-hotspots"
                        checked={showPhotoHotspots}
                        onCheckedChange={setShowPhotoHotspots}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    {photoHotspots.slice(0, 5).map((hotspot) => (
                      <button
                        key={hotspot.id}
                        onClick={() => {
                          setSelectedStop(null);
                          setSelectedPhotoHotspot(hotspot);
                        }}
                        className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 transition-colors text-left"
                      >
                        <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                          <Flame className="w-4 h-4 text-orange-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-foreground text-sm truncate">
                            {hotspot.name}
                          </p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Camera className="w-3 h-3" />
                            <span>{hotspot.photoCount.toLocaleString()} photos</span>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Day-by-Day Itinerary */}
            <div className="space-y-3">
              <h2 className="text-lg font-display font-semibold text-foreground">Itinerary</h2>

              {generatedTrip.days.map((day) => (
                <DayCard
                  key={day.day}
                  day={day}
                  expanded={expandedDays.includes(day.day)}
                  isActive={activeDay === day.day}
                  onToggle={() => toggleDay(day.day)}
                  onStartDay={() => handleStartDay(day.day)}
                  onStopClick={setSelectedStop}
                  onSwapHike={handleOpenHikeSwap}
                  onRemoveStop={handleRemoveStop}
                />
              ))}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4">
              <Button variant="hero" size="lg" className="flex-1" onClick={handleStartNavigation}>
                <Navigation className="w-4 h-4 mr-2" />
                Start Trip
              </Button>
              <Link to="/create-trip">
                <Button variant="outline" size="lg">
                  Edit Trip
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Alternative Hikes Modal */}
      {selectedHikeForSwap && (
        <AlternativeHikesModal
          isOpen={hikeModalOpen}
          onClose={() => {
            setHikeModalOpen(false);
            setSelectedHikeForSwap(null);
          }}
          currentHike={selectedHikeForSwap}
          searchLat={selectedHikeForSwap.coordinates.lat}
          searchLng={selectedHikeForSwap.coordinates.lng}
          onSelectHike={handleSwapHike}
        />
      )}
    </div>
  );
};

interface DayCardProps {
  day: TripDay;
  expanded: boolean;
  isActive: boolean;
  onToggle: () => void;
  onStartDay: () => void;
  onStopClick: (stop: TripStop) => void;
  onSwapHike: (hike: TripStop) => void;
  onRemoveStop: (dayNumber: number, stop: TripStop) => void;
}

const DayCard = ({ day, expanded, isActive, onToggle, onStartDay, onStopClick, onSwapHike, onRemoveStop }: DayCardProps) => {
  return (
    <Card className={`overflow-hidden ${isActive ? 'ring-2 ring-emerald-500 border-emerald-500' : ''}`}>
      {/* Day Header */}
      <div className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1"
        >
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isActive ? 'bg-emerald-500/20' : 'bg-primary/10'}`}>
            <span className={`text-lg font-bold ${isActive ? 'text-emerald-600' : 'text-primary'}`}>{day.day}</span>
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">
              Day {day.day}
              {isActive && <span className="ml-2 text-xs text-emerald-600 font-normal">(Active)</span>}
            </p>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Route className="w-3 h-3" />
                {day.drivingDistance}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {day.drivingTime}
              </span>
            </div>
          </div>
        </button>
        <div className="flex items-center gap-2">
          {day.hike && <Footprints className="w-4 h-4 text-emerald-500" />}
          {day.campsite && <Tent className="w-4 h-4 text-amber-500" />}
          <Button
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={isActive ? "bg-emerald-600 hover:bg-emerald-700" : ""}
            onClick={(e) => {
              e.stopPropagation();
              onStartDay();
            }}
          >
            <Navigation className="w-3 h-3 mr-1" />
            {isActive ? 'Active' : 'Preview'}
          </Button>
          <button onClick={onToggle}>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-5 h-5 text-muted-foreground" />
            )}
          </button>
        </div>
      </div>

      {/* Day Stops */}
      {expanded && (
        <div className="border-t border-border">
          {day.stops.map((stop, index) => {
            const Icon = getIcon(stop.type);
            const typeStyles = getTypeStyles(stop.type);

            return (
              <div
                key={stop.id}
                className="p-4 hover:bg-secondary/30 transition-colors border-b border-border last:border-b-0 group"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border ${typeStyles}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div
                        className="cursor-pointer flex-1"
                        onClick={() => onStopClick(stop)}
                      >
                        <h4 className="font-medium text-foreground">{stop.name}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{stop.description}</p>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {stop.type === 'hike' && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSwapHike(stop);
                            }}
                            className="p-1.5 rounded-lg hover:bg-primary/10 text-primary transition-colors"
                            title="Choose different hike"
                          >
                            <RefreshCw className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onRemoveStop(day.day, stop);
                          }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                          title="Remove stop"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {stop.duration}
                      </span>
                      {stop.distance && (
                        <span className="flex items-center gap-1">
                          <Route className="w-3 h-3" />
                          {stop.distance}
                        </span>
                      )}
                      {stop.rating && (
                        <span className="flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                          {stop.rating.toFixed(1)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
};

export default TripDetail;
