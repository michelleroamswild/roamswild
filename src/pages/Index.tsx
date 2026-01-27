import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { SavedLocations } from "@/components/SavedLocations";
import { LocalConditionsWidget } from "@/components/LocalConditionsWidget";
import { RecentSearchesWidget } from "@/components/RecentSearchesWidget";
import { SurpriseMeDialog } from "@/components/SurpriseMeDialog";
import { BestHikesTodayDialog } from "@/components/BestHikesTodayDialog";
import { useTrip } from "@/context/TripContext";
import { Path, Calendar, MapPinArea, CaretRight, Boot, ArrowRight, Users, Mountains, Tent, SunHorizon, Shuffle, Compass, SpinnerGap } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTripUrl } from "@/utils/slugify";
import { GoogleMap } from "@/components/GoogleMap";
import { Marker } from "@react-google-maps/api";
import { createMarkerIcon } from "@/utils/mapMarkers";

// Hero images for rotating parallax section
import heroImage1 from "@/images/herophotos/DJI_0693.jpg";
import heroImage2 from "@/images/herophotos/DJI_0671.jpg";
import heroImage3 from "@/images/herophotos/DSC09190.jpg";
import heroImage4 from "@/images/herophotos/DJI_0879.jpg";
import heroImage5 from "@/images/herophotos/DSC03022.jpg";
import heroImage6 from "@/images/herophotos/DSC05769.jpg";
import heroImage7 from "@/images/herophotos/DSC09645.jpg";

const heroImages = [heroImage1, heroImage2, heroImage3, heroImage4, heroImage5, heroImage6, heroImage7];

// Example points of interest for Zion National Park (empty state preview)
const ZION_EXAMPLE_POIS = {
  center: { lat: 37.24, lng: -112.95 },
  hikes: [
    { id: 'h1', name: "Angels Landing", lat: 37.2692, lng: -112.9465 },
    { id: 'h2', name: "The Narrows", lat: 37.3049, lng: -112.9476 },
    { id: 'h3', name: "Observation Point", lat: 37.2725, lng: -112.9340 },
  ],
  camps: [
    { id: 'c1', name: "Watchman Campground", lat: 37.1997, lng: -112.9874 },
    { id: 'c2', name: "South Campground", lat: 37.2053, lng: -112.9852 },
  ],
  viewpoints: [
    { id: 'v1', name: "Canyon Overlook", lat: 37.2130, lng: -112.9410 },
  ],
};

const Index = () => {
  const { savedTrips, loadSavedTrip, isLoading: tripsLoading } = useTrip();
  const navigate = useNavigate();
  const [surpriseMeOpen, setSurpriseMeOpen] = useState(false);
  const [bestHikesOpen, setBestHikesOpen] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  // Random hero image on page load
  const [currentHeroIndex] = useState(() => Math.floor(Math.random() * heroImages.length));

  const handleFindCampsNearMe = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser');
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setIsGettingLocation(false);
        navigate(`/dispersed?lat=${latitude}&lng=${longitude}&name=My%20Location`);
      },
      (error) => {
        setIsGettingLocation(false);
        console.error('Geolocation error:', error);
        alert('Unable to get your location. Please check your browser permissions.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const handleTripClick = (tripId: string, tripName: string) => {
    loadSavedTrip(tripId);
    navigate(getTripUrl(tripName));
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Hero + My Trips wrapper for floating widget positioning */}
      <div className="relative">
        {/* Hero Section with dark green topo background */}
        <div className="hero-topo dark:bg-background relative">
          <Header />

          <div className="container px-4 md:px-6 py-12 md:py-16 relative">
            {/* ARCHIVED: Hero Images - revisit later
            <div className="hidden xl:block absolute -left-[140px] top-16 z-0 animate-float-slow pointer-events-none">
              <div className="w-[320px] h-[440px] rounded-2xl overflow-hidden shadow-2xl transform -rotate-6">
                <img src={heroLeft} alt="" className="w-full h-full object-cover" />
              </div>
            </div>

            <div className="hidden xl:block absolute -right-[140px] top-16 z-0 animate-float-medium pointer-events-none">
              <div className="w-[320px] h-[440px] rounded-2xl overflow-hidden shadow-2xl transform rotate-6">
                <img src={heroRight} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            */}

            {/* Center Content */}
            <section className="text-center animate-fade-in max-w-4xl mx-auto relative z-10">
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
                <button
                  onClick={handleFindCampsNearMe}
                  disabled={isGettingLocation}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm disabled:opacity-70"
                >
                  {isGettingLocation ? (
                    <>
                      <SpinnerGap className="w-4 h-4 animate-spin" />
                      Getting location...
                    </>
                  ) : (
                    <>
                      <Tent className="w-4 h-4" weight="fill" />
                      Find camps near me
                    </>
                  )}
                </button>
                <button
                  onClick={() => setBestHikesOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-accent text-accent-foreground text-sm font-semibold hover:bg-accent/80 transition-colors shadow-sm"
                >
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
        {savedTrips.length > 0 ? (
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
        ) : (
          <section className="bg-background-secondary dark:bg-card pt-24 lg:pt-32 pb-16 md:pb-20 grainy">
            <div className="container px-4 md:px-6">
              <div className="mb-14 text-center">
                <h2 className="font-display font-bold text-white dark:text-foreground">My Trips</h2>
              </div>
              <div className="grid md:grid-cols-2 gap-8 items-center max-w-4xl mx-auto">
                {/* Interactive Map */}
                <div className="relative h-64 md:h-80 rounded-2xl overflow-hidden shadow-lg">
                  <GoogleMap
                    center={ZION_EXAMPLE_POIS.center}
                    zoom={12}
                    options={{
                      disableDefaultUI: true,
                      zoomControl: true,
                      fullscreenControl: false,
                      scrollwheel: true,
                      draggable: true,
                      gestureHandling: 'greedy',
                      mapTypeId: 'satellite',
                    }}
                  >
                    {/* Hike markers */}
                    {ZION_EXAMPLE_POIS.hikes.map((hike) => (
                      <Marker
                        key={hike.id}
                        position={{ lat: hike.lat, lng: hike.lng }}
                        title={hike.name}
                        icon={createMarkerIcon('hike', { size: 32 })}
                      />
                    ))}
                    {/* Camp markers */}
                    {ZION_EXAMPLE_POIS.camps.map((camp) => (
                      <Marker
                        key={camp.id}
                        position={{ lat: camp.lat, lng: camp.lng }}
                        title={camp.name}
                        icon={createMarkerIcon('camp', { size: 32 })}
                      />
                    ))}
                    {/* Viewpoint markers */}
                    {ZION_EXAMPLE_POIS.viewpoints.map((vp) => (
                      <Marker
                        key={vp.id}
                        position={{ lat: vp.lat, lng: vp.lng }}
                        title={vp.name}
                        icon={createMarkerIcon('viewpoint', { size: 32 })}
                      />
                    ))}
                  </GoogleMap>
                  <div className="absolute bottom-4 left-4">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/90 dark:bg-card/90 backdrop-blur-sm rounded-full text-xs font-medium text-foreground shadow-sm">
                      <MapPinArea className="w-3.5 h-3.5 text-terracotta" weight="fill" />
                      Zion National Park
                    </span>
                  </div>
                </div>

                {/* Content */}
                <div>
                  <h2 className="font-display font-bold text-2xl md:text-3xl text-white dark:text-foreground mb-3">
                    Plan your next adventure
                  </h2>
                  <p className="text-white/70 dark:text-muted-foreground mb-6">
                    Create custom road trip itineraries with campsites, hikes, and scenic stops all planned for you.
                  </p>

                  <div className="space-y-3 mb-8">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 dark:bg-aquateal/10 flex items-center justify-center flex-shrink-0">
                        <Tent className="w-4 h-4 text-white dark:text-aquateal" weight="fill" />
                      </div>
                      <span className="text-sm text-white dark:text-foreground">Find dispersed camping & campgrounds</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 dark:bg-pinesoft/10 flex items-center justify-center flex-shrink-0">
                        <Mountains className="w-4 h-4 text-white dark:text-pinesoft" weight="fill" />
                      </div>
                      <span className="text-sm text-white dark:text-foreground">Discover hikes along your route</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/10 dark:bg-lavenderslate/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-4 h-4 text-white dark:text-lavenderslate" weight="fill" />
                      </div>
                      <span className="text-sm text-white dark:text-foreground">Collaborate with friends on group trips</span>
                    </div>
                  </div>

                  <Link to="/create-trip">
                    <Button variant="secondary" size="lg">
                      <Path className="w-5 h-5 mr-2" weight="bold" />
                      Create your first trip
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Full-width hero image section with parallax */}
        <div className="w-full h-64 md:h-80 lg:h-[28rem] relative overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center bg-fixed"
            style={{ backgroundImage: `url(${heroImages[currentHeroIndex]})` }}
          />
        </div>
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
              © 2026 RoamsWild. Built for adventurers.
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

      {/* Best Hikes Today Dialog */}
      <BestHikesTodayDialog open={bestHikesOpen} onOpenChange={setBestHikesOpen} />
    </div>
  );
};

export default Index;
