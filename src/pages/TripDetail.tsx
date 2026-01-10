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
      return 'bg-primary/10 text-primary border-primary/20';
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
      return '#4a7a3c'; // forest-light color
    case 'camp':
      return '#f59e0b';
    case 'viewpoint':
      return '#2d5a3d';
    default:
      return '#6b7280';
  }
};

// Consistent tent icon SVG for campsite markers
const getTentMarkerIcon = (isActive: boolean = false) => ({
  url: `data:image/svg+xml,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="11" fill="#f59e0b" stroke="${isActive ? '#000000' : '#ffffff'}" stroke-width="${isActive ? 2.5 : 2}"/>
      <path d="M12 6L6 16h12L12 6z" fill="#ffffff" stroke="none"/>
      <path d="M12 6L6 16h12L12 6z M10 16l2-4 2 4" fill="none" stroke="#f59e0b" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  `)}`,
  scaledSize: new google.maps.Size(isActive ? 40 : 32, isActive ? 40 : 32),
  anchor: new google.maps.Point(isActive ? 20 : 16, isActive ? 20 : 16),
});

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
  const [showPhotoHotspots, setShowPhotoHotspots] = useState(false);
  const [photoHotspotsExpanded, setPhotoHotspotsExpanded] = useState(false);
  const [selectedPhotoHotspot, setSelectedPhotoHotspot] = useState<PhotoHotspot | null>(null);
  const [enlargedPhoto, setEnlargedPhoto] = useState<{ url: string; name: string } | null>(null);

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
    if (!generatedTrip) return;

    const day = generatedTrip.days.find(d => d.day === dayNumber);
    if (!day || day.stops.length === 0) return;

    // Set active day and expand it - useEffect will handle fetching directions
    setActiveDay(dayNumber);
    setExpandedDays(prev => prev.includes(dayNumber) ? prev : [...prev, dayNumber]);
  };

  // Exit day mode and show full trip
  const handleExitDayMode = () => {
    setActiveDay(null);
    setDayDirections(null);
  };

  // Clear directions when trip ID changes (new trip loaded)
  useEffect(() => {
    setDirections(null);
    setDayDirections(null);
    setActiveDay(null);
    setSelectedStop(null);
  }, [generatedTrip?.id]);

  // Refresh day directions when active day's stops change (e.g., hike swapped)
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip || activeDay === null) {
      return;
    }

    const day = generatedTrip.days.find(d => d.day === activeDay);
    if (!day || day.stops.length < 2) {
      setDayDirections(null);
      return;
    }

    const directionsService = new google.maps.DirectionsService();
    const dayStops = day.stops;

    const origin = dayStops[0].coordinates;
    const destination = dayStops[dayStops.length - 1].coordinates;
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
  }, [mapsLoaded, generatedTrip, activeDay]);

  // Fetch driving directions when map loads or trip changes
  // Simplified route: start/base → first stop → last stop (skip complex waypoints to avoid ZERO_RESULTS)
  useEffect(() => {
    if (!mapsLoaded || !generatedTrip) {
      return;
    }

    // Clear old directions first
    setDirections(null);

    const directionsService = new google.maps.DirectionsService();

    // Get the start/base location from the config
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;

    // Get all stops in order
    const allStops = generatedTrip.days.flatMap(day => day.stops);

    if (allStops.length === 0) {
      console.log('No stops for route');
      return;
    }

    // Determine origin: start location, base location, or first stop
    const origin = startLocation || baseLocation || allStops[0].coordinates;

    // Determine destination: last stop, or back to start if returnToStart
    const lastStop = allStops[allStops.length - 1].coordinates;
    const destination = (generatedTrip.config.returnToStart && startLocation)
      ? startLocation
      : lastStop;

    // Build simple waypoint list - just the key stops (camps and main activities)
    // Filter to unique locations and limit waypoints to avoid ZERO_RESULTS
    const keyStops = allStops
      .filter(s => s.type === 'camp' || s.type === 'hike' || s.type === 'viewpoint')
      .map(s => s.coordinates);

    // Remove consecutive duplicates
    const uniqueStops: google.maps.LatLngLiteral[] = [];
    for (const stop of keyStops) {
      const last = uniqueStops[uniqueStops.length - 1];
      if (!last || Math.abs(last.lat - stop.lat) > 0.001 || Math.abs(last.lng - stop.lng) > 0.001) {
        uniqueStops.push(stop);
      }
    }

    // Skip first if it's the origin, skip last if it's the destination
    let waypointStops = uniqueStops;
    if (waypointStops.length > 0) {
      const first = waypointStops[0];
      if (Math.abs(first.lat - origin.lat) < 0.001 && Math.abs(first.lng - origin.lng) < 0.001) {
        waypointStops = waypointStops.slice(1);
      }
    }
    if (waypointStops.length > 0) {
      const last = waypointStops[waypointStops.length - 1];
      if (Math.abs(last.lat - destination.lat) < 0.001 && Math.abs(last.lng - destination.lng) < 0.001) {
        waypointStops = waypointStops.slice(0, -1);
      }
    }

    // Limit to 10 waypoints to reduce chance of ZERO_RESULTS
    const limitedWaypoints = waypointStops.slice(0, 10);
    const waypoints = limitedWaypoints.map(coord => ({
      location: coord,
      stopover: true,
    }));

    console.log('Fetching directions:', {
      origin,
      destination,
      waypointCount: waypoints.length
    });

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
          console.log('Directions loaded successfully');
          setDirections(result);
        } else {
          console.error('Directions failed:', status);
          // Try without waypoints as fallback
          if (waypoints.length > 0) {
            console.log('Retrying with fewer waypoints...');
            directionsService.route(
              {
                origin,
                destination,
                waypoints: [],
                travelMode: google.maps.TravelMode.DRIVING,
              },
              (fallbackResult, fallbackStatus) => {
                if (fallbackStatus === google.maps.DirectionsStatus.OK && fallbackResult) {
                  console.log('Fallback directions loaded (origin to destination only)');
                  setDirections(fallbackResult);
                }
              }
            );
          }
        }
      }
    );
  }, [mapsLoaded, generatedTrip]);

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
    : { lat: 37.7749, lng: -122.4194 }; // Default to SF if no stops

  const handleStartNavigation = () => {
    // Get start/base location from config
    const startLocation = generatedTrip.config.startLocation?.coordinates;
    const baseLocation = generatedTrip.config.baseLocation?.coordinates;
    const isLocationBased = !!baseLocation;

    // Get route stops from the trip
    const routeStops = allStops.filter(stop =>
      stop.type === 'viewpoint' || stop.type === 'camp' || stop.type === 'hike'
    );

    // Determine origin
    const originCoords = startLocation || baseLocation || (routeStops.length > 0 ? routeStops[0].coordinates : null);
    if (!originCoords) return;

    // Determine destination
    const returnToStart = generatedTrip.config.returnToStart;
    const lastStopCoords = routeStops.length > 0 ? routeStops[routeStops.length - 1].coordinates : null;
    const destCoords = isLocationBased
      ? (lastStopCoords || baseLocation)
      : (returnToStart && startLocation ? startLocation : lastStopCoords);
    if (!destCoords) return;

    const origin = `${originCoords.lat},${originCoords.lng}`;
    const dest = `${destCoords.lat},${destCoords.lng}`;

    // Build waypoints
    const hasOriginLocation = startLocation || baseLocation;
    const waypointStops = hasOriginLocation ? routeStops : routeStops.slice(1);
    const finalWaypointStops = returnToStart ? waypointStops : waypointStops.slice(0, -1);
    const waypoints = finalWaypointStops
      .map((s) => `${s.coordinates.lat},${s.coordinates.lng}`)
      .join('|');

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
                  {/* Route directions - show day route if active, otherwise full trip */}
                  {(activeDay ? dayDirections : directions) && (
                    <DirectionsRenderer
                      key={activeDay ? `day-${activeDay}-route` : 'full-trip-route'}
                      directions={(activeDay ? dayDirections : directions)!}
                      options={{
                        suppressMarkers: true,
                        polylineOptions: {
                          strokeColor: activeDay ? '#4a7a3c' : '#2d5a3d',
                          strokeWeight: activeDay ? 5 : 4,
                          strokeOpacity: activeDay ? 1 : 0.8,
                        },
                      }}
                    />
                  )}

                  {/* Start/Base marker (only shown when viewing full trip) */}
                  {!activeDay && (tripConfig.startLocation || tripConfig.baseLocation) && (
                    <Marker
                      position={(tripConfig.startLocation || tripConfig.baseLocation)!.coordinates}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: '#2d5a3d',
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 3,
                        scale: 10,
                      }}
                      title={tripConfig.startLocation
                        ? `Start: ${tripConfig.startLocation.name}`
                        : `Base: ${tripConfig.baseLocation!.name}`
                      }
                    />
                  )}

                  {/* Show only active day's stops when day is selected, otherwise all stops */}
                  {(activeDay ? generatedTrip.days.find(d => d.day === activeDay)?.stops || [] : allStops).map((stop, index) => (
                    <Marker
                      key={stop.id}
                      position={stop.coordinates}
                      icon={stop.type === 'camp'
                        ? getTentMarkerIcon(!!activeDay)
                        : {
                            path: google.maps.SymbolPath.CIRCLE,
                            fillColor: getMarkerColor(stop.type),
                            fillOpacity: 1,
                            strokeColor: activeDay ? '#000000' : '#ffffff',
                            strokeWeight: activeDay ? 3 : 2,
                            scale: activeDay ? 10 : 8,
                          }
                      }
                      label={activeDay && stop.type !== 'camp' ? {
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
                      <div className="min-w-[200px]">
                        {selectedPhotoHotspot.samplePhotoUrl && (
                          <button
                            onClick={() => setEnlargedPhoto({ url: selectedPhotoHotspot.samplePhotoUrl!, name: selectedPhotoHotspot.name })}
                            className="w-full h-32 overflow-hidden rounded-t-lg cursor-pointer"
                          >
                            <img
                              src={selectedPhotoHotspot.samplePhotoUrl}
                              alt={selectedPhotoHotspot.name}
                              className="w-full h-full object-cover hover:scale-105 transition-transform"
                            />
                          </button>
                        )}
                        <div className="p-2">
                          <h4 className="font-semibold text-gray-900 text-sm">
                            {selectedPhotoHotspot.name}
                          </h4>
                          <p className="text-gray-500 text-xs mt-0.5">
                            {selectedPhotoHotspot.photoCount.toLocaleString()} photos
                          </p>
                        </div>
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
                          className="w-full px-3 py-1.5 bg-primary text-primary-foreground text-sm rounded hover:bg-primary-hover transition-colors"
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
                          <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                            <span className="text-lg font-bold text-primary">{activeDay}</span>
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
                  <button
                    onClick={() => setPhotoHotspotsExpanded(!photoHotspotsExpanded)}
                    className="w-full flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <Flame className="w-5 h-5 text-orange-500" />
                      <h3 className="font-semibold text-foreground">Photo Hotspots</h3>
                      <span className="text-xs text-muted-foreground">({photoHotspots.length})</span>
                    </div>
                    {photoHotspotsExpanded ? (
                      <ChevronUp className="w-5 h-5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-muted-foreground" />
                    )}
                  </button>

                  {photoHotspotsExpanded && (
                    <div className="mt-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">via Flickr</span>
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
                          <div
                            key={hotspot.id}
                            className="flex items-center gap-3 p-2 rounded-lg hover:bg-orange-500/10 transition-colors"
                          >
                            {hotspot.samplePhotoUrl ? (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEnlargedPhoto({ url: hotspot.samplePhotoUrl!, name: hotspot.name });
                                }}
                                className="w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-orange-500 transition-all"
                              >
                                <img
                                  src={hotspot.samplePhotoUrl}
                                  alt={hotspot.name}
                                  className="w-full h-full object-cover"
                                />
                              </button>
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                                <Flame className="w-5 h-5 text-orange-500" />
                              </div>
                            )}
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedStop(null);
                                setSelectedPhotoHotspot(hotspot);
                                setShowPhotoHotspots(true);
                              }}
                              className="flex-1 min-w-0 text-left"
                            >
                              <p className="font-medium text-foreground text-sm truncate">
                                {hotspot.name}
                              </p>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Camera className="w-3 h-3" />
                                <span>{hotspot.photoCount.toLocaleString()} photos</span>
                              </div>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
                  onExitDay={handleExitDayMode}
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

      {/* Photo Lightbox */}
      {enlargedPhoto && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setEnlargedPhoto(null)}
        >
          <button
            className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors"
            onClick={() => setEnlargedPhoto(null)}
          >
            <X className="w-8 h-8" />
          </button>
          <div className="max-w-4xl max-h-[90vh] relative" onClick={(e) => e.stopPropagation()}>
            <img
              src={enlargedPhoto.url}
              alt={enlargedPhoto.name}
              className="max-w-full max-h-[85vh] object-contain rounded-lg"
            />
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4 rounded-b-lg">
              <p className="text-white font-medium">{enlargedPhoto.name}</p>
              <p className="text-white/70 text-sm flex items-center gap-1">
                <Flame className="w-3 h-3" />
                Photo Hotspot via Flickr
              </p>
            </div>
          </div>
        </div>
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
  onExitDay: () => void;
  onStopClick: (stop: TripStop) => void;
  onSwapHike: (hike: TripStop) => void;
  onRemoveStop: (dayNumber: number, stop: TripStop) => void;
}

const DayCard = ({ day, expanded, isActive, onToggle, onStartDay, onExitDay, onStopClick, onSwapHike, onRemoveStop }: DayCardProps) => {
  return (
    <Card className={`overflow-hidden ${isActive ? 'ring-2 ring-primary border-primary' : ''}`}>
      {/* Day Header */}
      <div className="flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors">
        <button
          onClick={onToggle}
          className="flex items-center gap-3 flex-1"
        >
          <div className={`flex items-center justify-center w-10 h-10 rounded-full ${isActive ? 'bg-primary/20' : 'bg-primary/10'}`}>
            <span className={`text-lg font-bold ${isActive ? 'text-forest-light' : 'text-primary'}`}>{day.day}</span>
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">
              Day {day.day}
              {isActive && <span className="ml-2 text-xs text-forest-light font-normal">(Active)</span>}
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
          {day.hike && <Footprints className="w-4 h-4 text-forest-light" />}
          {day.campsite && <Tent className="w-4 h-4 text-amber-500" />}
          <Button
            variant={isActive ? "default" : "outline"}
            size="sm"
            className={isActive ? "bg-primary hover:bg-primary-hover" : ""}
            onClick={(e) => {
              e.stopPropagation();
              if (isActive) {
                onExitDay();
              } else {
                onStartDay();
              }
            }}
          >
            <Navigation className="w-3 h-3 mr-1" />
            {isActive ? 'Exit Preview' : 'Preview'}
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
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
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
                      {stop.drivingTime && (
                        <span className="flex items-center gap-1 text-primary">
                          <Navigation className="w-3 h-3" />
                          {stop.drivingTime}
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
