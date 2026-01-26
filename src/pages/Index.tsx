import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { SavedLocations } from "@/components/SavedLocations";
import { LocalConditionsWidget } from "@/components/LocalConditionsWidget";
import { RecentSearchesWidget } from "@/components/RecentSearchesWidget";
import { SurpriseMeDialog } from "@/components/SurpriseMeDialog";
import { useTrip } from "@/context/TripContext";
import { Path, Calendar, MapPinArea, CaretRight, Boot, ArrowRight, Users, Mountains, Tent, SunHorizon, Shuffle, Compass } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTripUrl } from "@/utils/slugify";

const Index = () => {
  const { savedTrips, loadSavedTrip, isLoading: tripsLoading } = useTrip();
  const navigate = useNavigate();
  const [surpriseMeOpen, setSurpriseMeOpen] = useState(false);

  const handleTripClick = (tripId: string, tripName: string) => {
    loadSavedTrip(tripId);
    navigate(getTripUrl(tripName));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero + My Trips wrapper for floating widget positioning */}
      <div className="relative">
        {/* Hero Section with dark green topo background */}
        <div className="hero-topo dark:bg-background relative overflow-visible">
          <Header />

          <div className="container px-4 md:px-6 py-12 md:py-16">
            {/* Center Content */}
            <section className="text-center animate-fade-in max-w-4xl mx-auto">
              <h1 className="font-display font-bold text-primary dark:text-foreground mb-4">
                <span className="text-gradient-forest block text-5xl md:text-6xl lg:text-7xl" style={{ lineHeight: 1.1 }}>
                  Where to next?
                </span>
              </h1>
              <p className="text-lg md:text-xl text-primary/70 dark:text-muted-foreground max-w-2xl mx-auto mb-8">
                Try "Moab, Utah" "Olympic Peninsula" or "Joshua Tree"
              </p>

              <SearchBar />

              {/* Quick Links */}
              <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm">
                  <Tent className="w-4 h-4" weight="fill" />
                  Find camps near me
                </button>
                <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm">
                  <Compass className="w-4 h-4" weight="fill" />
                  Best hikes today
                </button>
                <button
                  onClick={() => setSurpriseMeOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm"
                >
                  <Shuffle className="w-4 h-4" weight="bold" />
                  Surprise me
                </button>
                <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm">
                  <SunHorizon className="w-4 h-4" weight="fill" />
                  Sunset conditions
                </button>
              </div>
            </section>
          </div>

          {/* Floating Widgets Zone - absolutely positioned at bottom of hero, overlapping into next section */}
          <div className="hidden lg:block absolute left-0 right-0 bottom-0 translate-y-1/2 z-20 pointer-events-none">
            <div className="container px-4 md:px-6">
              <div className="flex justify-center items-center gap-6 pointer-events-auto">
                <RecentSearchesWidget />
                <LocalConditionsWidget />
              </div>
            </div>
          </div>
        </div>

        {/* Saved Trips Section */}
        {savedTrips.length > 0 && (
          <section className="bg-background-secondary dark:bg-card pt-24 lg:pt-32 pb-16 md:pb-20 grainy">
          <div className="container px-4 md:px-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display font-bold text-white dark:text-foreground">My Trips</h2>
                <p className="text-white/70 dark:text-muted-foreground mt-1">
                  {savedTrips.length} saved {savedTrips.length === 1 ? 'trip' : 'trips'}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/create-trip">
                  <Button variant="secondary" size="sm">
                    <Path className="w-4 h-4 mr-1" weight="bold" />
                    Create Trip
                  </Button>
                </Link>
                <Link to="/my-trips">
                  <Button variant="tertiary" size="sm" className="text-white dark:text-foreground border-white/30 dark:border-border hover:border-white dark:hover:border-primary hover:bg-white/10 dark:hover:bg-primary/10">
                    View All
                    <CaretRight className="w-4 h-4 ml-1" weight="bold" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...savedTrips]
                .sort((a, b) => {
                  // Trips with start dates come first, sorted by soonest
                  const aDate = a.config.startDate ? new Date(a.config.startDate).getTime() : null;
                  const bDate = b.config.startDate ? new Date(b.config.startDate).getTime() : null;
                  if (aDate && !bDate) return -1;
                  if (!aDate && bDate) return 1;
                  if (aDate && bDate) return aDate - bDate;
                  return 0;
                })
                .slice(0, 3)
                .map((trip) => {
                // Calculate days until trip
                const daysUntilTrip = trip.config.startDate
                  ? Math.ceil((new Date(trip.config.startDate).getTime() - new Date().setHours(0,0,0,0)) / (1000 * 60 * 60 * 24))
                  : null;

                // Calculate total hiking miles
                const totalHikingMiles = trip.days.reduce((total, day) => {
                  const hikeMiles = day.stops
                    .filter(stop => stop.type === 'hike')
                    .reduce((sum, hike) => {
                      const miles = parseFloat(hike.distance?.replace(/[^0-9.]/g, '') || '0');
                      return sum + miles;
                    }, 0);
                  return total + hikeMiles;
                }, 0);

                // Build route info
                const startName = trip.config.baseLocation?.name.split(',')[0]
                  || trip.config.startLocation?.name.split(',')[0]
                  || null;
                const destinationCount = trip.config.destinations?.length || 0;
                const endName = trip.config.returnToStart
                  ? startName
                  : trip.config.destinations?.[destinationCount - 1]?.name.split(',')[0] || null;

                // Count hikes
                const hikeCount = trip.days.reduce((count, day) => {
                  return count + day.stops.filter(stop => stop.type === 'hike').length;
                }, 0);

                return (
                  <Card
                    key={trip.id}
                    className="group hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full bg-card dark:bg-background border-border"
                    onClick={() => handleTripClick(trip.id, trip.config.name)}
                  >
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <h3 className="font-display font-semibold text-lg text-foreground group-hover:text-primary transition-colors truncate">
                            {trip.config.name || 'Untitled Trip'}
                          </h3>
                          {/* Coming up badge */}
                          {daysUntilTrip !== null && daysUntilTrip >= 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-primary/10 text-primary rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0">
                              {daysUntilTrip === 0
                                ? 'Today!'
                                : daysUntilTrip === 1
                                  ? 'Tomorrow'
                                  : `In ${daysUntilTrip} days`}
                            </span>
                          )}
                        </div>
                        {(trip.collaboratorCount ?? 0) > 0 && (
                          <div className="flex items-center gap-1 px-2 py-1 bg-emerald-500/10 rounded-full flex-shrink-0">
                            <Users className="w-3.5 h-3.5 text-emerald-600" weight="fill" />
                            <span className="text-xs font-medium text-emerald-600">{trip.collaboratorCount! + 1}</span>
                          </div>
                        )}
                      </div>

                      {/* Route visualization */}
                      {startName && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
                          <MapPinArea className="w-4 h-4 flex-shrink-0 text-aquateal" />
                          <span className="truncate">{startName}</span>
                          {destinationCount > 0 && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                              <span className="text-foreground font-medium whitespace-nowrap">
                                {destinationCount} {destinationCount === 1 ? 'stop' : 'stops'}
                              </span>
                            </>
                          )}
                          {endName && endName !== startName && (
                            <>
                              <ArrowRight className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />
                              <span className="truncate">{endName}</span>
                            </>
                          )}
                          {trip.config.returnToStart && (
                            <span className="text-xs text-muted-foreground/70 ml-1">(round trip)</span>
                          )}
                        </div>
                      )}

                      {/* Divider */}
                      <div className="h-px bg-border mb-4" />

                      {/* Stats grid */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-accentdark/10 flex items-center justify-center">
                            <Calendar className="w-4 h-4 text-accentdark" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Duration</p>
                            <p className="text-sm font-medium text-foreground">{trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-secondaryaccent/10 flex items-center justify-center">
                            <Path className="w-4 h-4 text-secondaryaccent" />
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Driving</p>
                            <p className="text-sm font-medium text-foreground">{trip.totalDistance || '—'}</p>
                          </div>
                        </div>

                        {hikeCount > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-lavenderslate/20 flex items-center justify-center">
                              <Mountains className="w-4 h-4 text-lavenderslate" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Hikes</p>
                              <p className="text-sm font-medium text-foreground">{hikeCount} {hikeCount === 1 ? 'hike' : 'hikes'}</p>
                            </div>
                          </div>
                        )}

                        {totalHikingMiles > 0 && (
                          <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-pinesoft/20 flex items-center justify-center">
                              <Boot className="w-4 h-4 text-pinesoft" />
                            </div>
                            <div>
                              <p className="text-xs text-muted-foreground">Hiking</p>
                              <p className="text-sm font-medium text-foreground">{totalHikingMiles.toFixed(1)} mi</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>
        )}
      </div>

      <main className="container px-4 md:px-6 py-8 md:py-12">
        {/* Saved Locations */}
        <div className="mb-12">
          <SavedLocations />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border mt-16">
        <div className="container px-4 md:px-6 py-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              © 2026 TrailBound. Built for adventurers.
            </p>
            <div className="flex items-center gap-6">
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Privacy
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Terms
              </a>
              <a href="#" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                Help
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* Surprise Me Dialog */}
      <SurpriseMeDialog open={surpriseMeOpen} onOpenChange={setSurpriseMeOpen} />
    </div>
  );
};

export default Index;
