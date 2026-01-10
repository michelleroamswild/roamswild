import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Plus,
  Route,
  Clock,
  Calendar,
  Trash2,
  MapPin,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useTrip } from '@/context/TripContext';
import { toast } from 'sonner';

const MyTrips = () => {
  const navigate = useNavigate();
  const { savedTrips, loadSavedTrip, deleteSavedTrip } = useTrip();

  const handleTripClick = (tripId: string) => {
    loadSavedTrip(tripId);
    navigate(`/trip/${tripId}`);
  };

  const handleDelete = (e: React.MouseEvent, tripId: string, tripName: string) => {
    e.stopPropagation();
    deleteSavedTrip(tripId);
    toast.success(`Deleted "${tripName}"`, {
      description: 'Trip removed from your saved trips',
    });
  };

  return (
    <div className="min-h-screen bg-background topo-pattern">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="container px-4 md:px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon" className="rounded-full">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-xl font-display font-bold text-foreground">My Trips</h1>
                <p className="text-sm text-muted-foreground">
                  {savedTrips.length} saved {savedTrips.length === 1 ? 'trip' : 'trips'}
                </p>
              </div>
            </div>
            <Link to="/create-trip">
              <Button variant="hero" size="sm">
                <Plus className="w-4 h-4 mr-1" />
                New Trip
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="container px-4 md:px-6 py-8 max-w-4xl mx-auto">
        {savedTrips.length === 0 ? (
          <div className="text-center py-16">
            <div className="flex items-center justify-center w-20 h-20 bg-secondary rounded-full mx-auto mb-6">
              <Route className="w-10 h-10 text-muted-foreground" />
            </div>
            <h2 className="text-2xl font-display font-bold text-foreground mb-2">
              No saved trips yet
            </h2>
            <p className="text-muted-foreground mb-8 max-w-md mx-auto">
              Create your first trip to start planning your next adventure. We'll save your
              campsites, hikes, and itinerary.
            </p>
            <Link to="/create-trip">
              <Button variant="hero" size="lg">
                <Plus className="w-5 h-5 mr-2" />
                Create Your First Trip
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {savedTrips.map((trip, index) => (
              <Card
                key={trip.id}
                className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer animate-fade-in overflow-hidden"
                style={{ animationDelay: `${index * 50}ms` }}
                onClick={() => handleTripClick(trip.id)}
              >
                <CardContent className="p-0">
                  <div className="flex items-stretch">
                    {/* Left accent bar */}
                    <div className="w-1.5 bg-primary" />

                    <div className="flex-1 p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="text-lg font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate">
                            {trip.config.name || 'Untitled Trip'}
                          </h3>

                          {/* Start/Base location */}
                          <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground">
                            <MapPin className="w-4 h-4 flex-shrink-0" />
                            <span className="truncate">
                              {trip.config.baseLocation
                                ? `Exploring ${trip.config.baseLocation.name}`
                                : trip.config.startLocation?.name
                                  ? `From ${trip.config.startLocation.name}`
                                  : 'Trip'}
                            </span>
                          </div>

                          {/* Destinations */}
                          {trip.config.destinations && trip.config.destinations.length > 0 && (
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Route className="w-4 h-4 flex-shrink-0" />
                              <span className="truncate">
                                {trip.config.destinations.length}{' '}
                                {trip.config.destinations.length === 1
                                  ? 'destination'
                                  : 'destinations'}
                                {trip.config.returnToStart && ' (round trip)'}
                              </span>
                            </div>
                          )}

                          {/* Stats */}
                          <div className="flex items-center gap-4 mt-3 text-sm">
                            <span className="flex items-center gap-1.5 text-foreground font-medium">
                              <Calendar className="w-4 h-4 text-primary" />
                              {trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}
                            </span>
                            <span className="flex items-center gap-1.5 text-foreground font-medium">
                              <Route className="w-4 h-4 text-terracotta" />
                              {trip.totalDistance}
                            </span>
                            <span className="flex items-center gap-1.5 text-foreground font-medium">
                              <Clock className="w-4 h-4 text-muted-foreground" />
                              {trip.totalDrivingTime}
                            </span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={(e) => handleDelete(e, trip.id, trip.config.name)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                          <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default MyTrips;
