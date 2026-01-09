import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Route,
  Clock,
  Mountain,
  Tent,
  Fuel,
  MapPin,
  Navigation,
  Share2,
  Download,
  Star,
  Calendar,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Footprints,
  Eye,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { GoogleMap } from '@/components/GoogleMap';
import { Marker, InfoWindow, Polyline } from '@react-google-maps/api';
import { TripStop, TripDay } from '@/types/trip';

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
  const { generatedTrip, tripConfig } = useTrip();

  const [expandedDays, setExpandedDays] = useState<number[]>([1]);
  const [selectedStop, setSelectedStop] = useState<TripStop | null>(null);
  const [mapsLoaded, setMapsLoaded] = useState(false);

  // Redirect if no trip data
  useEffect(() => {
    if (!generatedTrip) {
      navigate('/create-trip');
    }
  }, [generatedTrip, navigate]);

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

  // Build route path for polyline
  const routePath = [
    tripConfig.startLocation.coordinates,
    ...tripConfig.destinations.map((d) => d.coordinates),
  ];
  if (tripConfig.returnToStart) {
    routePath.push(tripConfig.startLocation.coordinates);
  }

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
              <Link to="/create-trip">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
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
              <Button variant="ghost" size="icon" className="rounded-full">
                <Star className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Share2 className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="icon" className="rounded-full">
                <Download className="w-5 h-5" />
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
                  center={mapCenter}
                  zoom={8}
                  className="w-full h-full"
                  onLoad={() => setMapsLoaded(true)}
                >
                  {/* Route polyline */}
                  {mapsLoaded && routePath.length > 1 && (
                    <Polyline
                      path={routePath}
                      options={{
                        strokeColor: '#2d5a3d',
                        strokeOpacity: 0.8,
                        strokeWeight: 3,
                      }}
                    />
                  )}

                  {/* Start marker */}
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

                  {/* All stops markers */}
                  {allStops.map((stop) => (
                    <Marker
                      key={stop.id}
                      position={stop.coordinates}
                      icon={{
                        path: google.maps.SymbolPath.CIRCLE,
                        fillColor: getMarkerColor(stop.type),
                        fillOpacity: 1,
                        strokeColor: '#ffffff',
                        strokeWeight: 2,
                        scale: 8,
                      }}
                      title={stop.name}
                      onClick={() => setSelectedStop(stop)}
                    />
                  ))}

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

            {/* Day-by-Day Itinerary */}
            <div className="space-y-3">
              <h2 className="text-lg font-display font-semibold text-foreground">Itinerary</h2>

              {generatedTrip.days.map((day) => (
                <DayCard
                  key={day.day}
                  day={day}
                  expanded={expandedDays.includes(day.day)}
                  onToggle={() => toggleDay(day.day)}
                  onStopClick={setSelectedStop}
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
    </div>
  );
};

interface DayCardProps {
  day: TripDay;
  expanded: boolean;
  onToggle: () => void;
  onStopClick: (stop: TripStop) => void;
}

const DayCard = ({ day, expanded, onToggle, onStopClick }: DayCardProps) => {
  return (
    <Card className="overflow-hidden">
      {/* Day Header */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-secondary/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
            <span className="text-lg font-bold text-primary">{day.day}</span>
          </div>
          <div className="text-left">
            <p className="font-medium text-foreground">Day {day.day}</p>
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
        </div>
        <div className="flex items-center gap-2">
          {day.hike && <Footprints className="w-4 h-4 text-emerald-500" />}
          {day.campsite && <Tent className="w-4 h-4 text-amber-500" />}
          {expanded ? (
            <ChevronUp className="w-5 h-5 text-muted-foreground" />
          ) : (
            <ChevronDown className="w-5 h-5 text-muted-foreground" />
          )}
        </div>
      </button>

      {/* Day Stops */}
      {expanded && (
        <div className="border-t border-border">
          {day.stops.map((stop, index) => {
            const Icon = getIcon(stop.type);
            const typeStyles = getTypeStyles(stop.type);

            return (
              <div
                key={stop.id}
                className="p-4 hover:bg-secondary/30 transition-colors cursor-pointer border-b border-border last:border-b-0"
                onClick={() => onStopClick(stop)}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`flex items-center justify-center w-9 h-9 rounded-lg border ${typeStyles}`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="font-medium text-foreground">{stop.name}</h4>
                        <p className="text-sm text-muted-foreground mt-0.5">{stop.description}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-muted-foreground flex-shrink-0" />
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
