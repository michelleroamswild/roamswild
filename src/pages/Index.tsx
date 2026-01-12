import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { SavedLocations } from "@/components/SavedLocations";
import { Suggestions } from "@/components/Suggestions";
import { useTrip } from "@/context/TripContext";
import { Path, Calendar, Clock, MapPinArea, CaretRight, Boot, ArrowRight, Users, Mountains } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTripUrl } from "@/utils/slugify";

// Hero photos
import heroPhoto1 from "@/images/herophotos/DJI_0693.jpg";
import heroPhoto2 from "@/images/herophotos/DSC09190.jpg";
import heroPhoto3 from "@/images/herophotos/DJI_0879.jpg";
import heroPhoto4 from "@/images/herophotos/DSC09645.jpg";
import heroPhoto5 from "@/images/herophotos/DJI_0671.jpg";
import heroPhoto6 from "@/images/herophotos/DSC03022.jpg";
import heroPhoto7 from "@/images/herophotos/DSC05769.jpg";

const allHeroPhotos = [heroPhoto1, heroPhoto2, heroPhoto3, heroPhoto4, heroPhoto5, heroPhoto6, heroPhoto7];

// Shuffle array and pick first 4
const getRandomPhotos = () => {
  const shuffled = [...allHeroPhotos].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4);
};

const rotatingWords = [
  "Adventure",
  "Road Trip",
  "Camping Trip",
  "Photo Adventure",
  "Offroad Trip",
  "Guys Trip",
  "Ladies Weekend",
  "Overlanding Expedition",
];

const Index = () => {
  const [currentWordIndex, setCurrentWordIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scrollY, setScrollY] = useState(0);
  const [heroPhotos] = useState(() => getRandomPhotos());
  const { savedTrips, loadSavedTrip, isLoading: tripsLoading } = useTrip();
  const navigate = useNavigate();

  const handleTripClick = (tripId: string, tripName: string) => {
    loadSavedTrip(tripId);
    navigate(getTripUrl(tripName));
  };

  useEffect(() => {
    const interval = setInterval(() => {
      setIsAnimating(true);
      setTimeout(() => {
        setCurrentWordIndex((prev) => (prev + 1) % rotatingWords.length);
        setIsAnimating(false);
      }, 200);
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with dark green topo background */}
      <div className="hero-topo overflow-x-clip">
        <Header />

        <div className="container px-4 md:px-6 py-40 relative">
          {/* Left Photo Collage - Hidden on mobile */}
          <div className="hidden lg:block absolute left-0 top-8 w-[400px] xl:w-[500px] pointer-events-none">
            <div
              className="absolute top-0 -left-48 xl:-left-64 z-10 animate-float-slow"
              style={{ animationDelay: '0s' }}
            >
              <div
                className="w-96 xl:w-[450px] h-64 xl:h-80 overflow-hidden shadow-2xl rounded-2xl"
                style={{
                  transform: `translateX(${scrollY > 200 ? '-70vw' : `${-scrollY * 0.3}px`}) rotate(-6deg)`,
                  transition: `transform ${scrollY > 200 ? '2s' : '0.8s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={heroPhotos[0]} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <div
              className="absolute top-64 xl:top-72 -left-40 xl:-left-56 z-20 animate-float-medium"
              style={{ animationDelay: '0.5s' }}
            >
              <div
                className="w-[420px] xl:w-[500px] h-72 xl:h-80 overflow-hidden shadow-2xl rounded-2xl"
                style={{
                  transform: `translateX(${scrollY > 280 ? '-70vw' : `${-scrollY * 0.4}px`}) rotate(4deg)`,
                  transition: `transform ${scrollY > 280 ? '2.5s' : '1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={heroPhotos[1]} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Right Photo Collage - Hidden on mobile */}
          <div className="hidden lg:block absolute right-0 top-8 w-[400px] xl:w-[500px] pointer-events-none">
            <div
              className="absolute top-0 -right-48 xl:-right-64 z-10 animate-float-medium"
              style={{ animationDelay: '0.3s' }}
            >
              <div
                className="w-96 xl:w-[450px] h-64 xl:h-72 overflow-hidden shadow-2xl rounded-2xl"
                style={{
                  transform: `translateX(${scrollY > 240 ? '70vw' : `${scrollY * 0.35}px`}) rotate(5deg)`,
                  transition: `transform ${scrollY > 240 ? '2.2s' : '0.9s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={heroPhotos[2]} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
            <div
              className="absolute top-60 xl:top-72 -right-36 xl:-right-48 z-20 animate-float-slow"
              style={{ animationDelay: '0.8s' }}
            >
              <div
                className="w-[420px] xl:w-[500px] h-72 xl:h-80 overflow-hidden shadow-2xl rounded-2xl"
                style={{
                  transform: `translateX(${scrollY > 320 ? '70vw' : `${scrollY * 0.45}px`}) rotate(-3deg)`,
                  transition: `transform ${scrollY > 320 ? '3s' : '1.1s'} cubic-bezier(0.1, 0.4, 0.2, 1)`
                }}
              >
                <img src={heroPhotos[3]} alt="" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Center Content */}
          <section className="text-center animate-fade-in relative z-10 max-w-3xl mx-auto">
            <h1 className="font-display font-bold text-primary mb-4 overflow-visible">
              <span className="text-2xl md:text-3xl lg:text-4xl block mb-2">Plan Your Next</span>
              <span
                className={`text-gradient-forest block text-5xl md:text-6xl lg:text-7xl transition-all duration-200 whitespace-nowrap ${
                  isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                }`}
                style={{ lineHeight: 1.1 }}
              >
                {rotatingWords[currentWordIndex]}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-primary/70 max-w-2xl mx-auto mb-8">
              Discover trails, find dispersed campsites, and build the perfect overlanding route from your saved locations.
            </p>

            <SearchBar />
          </section>
        </div>
      </div>

      {/* Saved Trips Section */}
      {savedTrips.length > 0 && (
        <section className="bg-accentdark py-40 md:py-52 grainy">
          <div className="container px-4 md:px-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="font-display font-bold text-white">My Trips</h2>
                <p className="text-white/70 mt-1">
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
                  <Button variant="tertiary" size="sm" className="text-white border-white/30 hover:border-white hover:bg-white/10">
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
                    className="group hover:shadow-[0_12px_40px_rgba(0,0,0,0.25)] hover:-translate-y-1 transition-all duration-300 cursor-pointer h-full bg-card border-border"
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
                          <MapPinArea className="w-4 h-4 flex-shrink-0 text-[#34b5a5]" />
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
                              <Mountains className="w-4 h-4 text-[#6b5ce6]" />
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
                              <Boot className="w-4 h-4 text-[#3c8a79]" />
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

      <main className="container px-4 md:px-6 py-8 md:py-12">

        {/* Saved Locations */}
        <div className="mb-12">
          <SavedLocations />
        </div>

        {/* Divider */}
        <div className="w-full h-px bg-border my-12" />

        {/* Suggestions - Near You */}
        <div className="mb-12">
          <Suggestions />
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
    </div>
  );
};

export default Index;
