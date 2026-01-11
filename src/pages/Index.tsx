import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { SavedLocations } from "@/components/SavedLocations";
import { Suggestions } from "@/components/Suggestions";
import { useTrip } from "@/context/TripContext";
import { Path, Calendar, Clock, MapPinArea, CaretRight, Plus } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getTripUrl } from "@/utils/slugify";

// Hero photos
import heroPhoto1 from "@/images/herophotos/DJI_0693.jpg";
import heroPhoto2 from "@/images/herophotos/DSC09190.jpg";
import heroPhoto3 from "@/images/herophotos/DJI_0879.jpg";
import heroPhoto4 from "@/images/herophotos/DSC09645.jpg";

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
  const { savedTrips, isLoading: tripsLoading } = useTrip();

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
          <div
            className="hidden lg:block absolute left-0 top-8 w-[400px] xl:w-[500px] pointer-events-none transition-transform duration-100 ease-out"
            style={{ transform: `translateX(${-scrollY * 0.5}px)` }}
          >
            <div
              className="absolute top-0 -left-48 xl:-left-64 w-96 xl:w-[450px] h-64 xl:h-80 overflow-hidden shadow-2xl rotate-[-6deg] animate-float-slow z-10"
              style={{ animationDelay: '0s' }}
            >
              <img src={heroPhoto1} alt="" className="w-full h-full object-cover" />
            </div>
            <div
              className="absolute top-64 xl:top-72 -left-40 xl:-left-56 w-[420px] xl:w-[500px] h-72 xl:h-80 overflow-hidden shadow-2xl rotate-[4deg] animate-float-medium z-20"
              style={{ animationDelay: '0.5s' }}
            >
              <img src={heroPhoto2} alt="" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Right Photo Collage - Hidden on mobile */}
          <div
            className="hidden lg:block absolute right-0 top-8 w-[400px] xl:w-[500px] pointer-events-none transition-transform duration-100 ease-out"
            style={{ transform: `translateX(${scrollY * 0.5}px)` }}
          >
            <div
              className="absolute top-0 -right-48 xl:-right-64 w-96 xl:w-[450px] h-64 xl:h-72 overflow-hidden shadow-2xl rotate-[5deg] animate-float-medium z-10"
              style={{ animationDelay: '0.3s' }}
            >
              <img src={heroPhoto3} alt="" className="w-full h-full object-cover" />
            </div>
            <div
              className="absolute top-60 xl:top-72 -right-36 xl:-right-48 w-[420px] xl:w-[500px] h-72 xl:h-80 overflow-hidden shadow-2xl rotate-[-3deg] animate-float-slow z-20"
              style={{ animationDelay: '0.8s' }}
            >
              <img src={heroPhoto4} alt="" className="w-full h-full object-cover" />
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
        <section className="bg-accentdark py-16 md:py-20 min-h-[500px] flex items-center">
          <div className="container px-4 md:px-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-2xl font-display font-bold text-white">My Trips</h2>
                <p className="text-white/70 mt-1">
                  {savedTrips.length} saved {savedTrips.length === 1 ? 'trip' : 'trips'}
                </p>
              </div>
              <div className="flex gap-2">
                <Link to="/create-trip">
                  <Button variant="outline" size="sm" className="border-white/30 text-white hover:bg-white/10">
                    <Plus className="w-4 h-4 mr-1" />
                    New Trip
                  </Button>
                </Link>
                <Link to="/my-trips">
                  <Button variant="ghost" size="sm" className="text-white hover:bg-white/10">
                    View All
                    <CaretRight className="w-4 h-4 ml-1" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {savedTrips.slice(0, 3).map((trip) => (
                <Link key={trip.id} to={getTripUrl(trip.config.name)}>
                  <Card className="group hover:shadow-[0_8px_30px_rgba(0,0,0,0.3)] transition-all duration-300 cursor-pointer h-full bg-card border-border">
                    <CardContent className="p-5">
                      <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate mb-2">
                        {trip.config.name || 'Untitled Trip'}
                      </h3>

                      <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                        <MapPinArea className="w-4 h-4 flex-shrink-0" />
                        <span className="truncate">
                          {trip.config.baseLocation
                            ? trip.config.baseLocation.name
                            : trip.config.startLocation?.name || 'Trip'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-sm">
                        <span className="flex items-center gap-1.5 text-foreground">
                          <Calendar className="w-4 h-4 text-accentdark" />
                          {trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}
                        </span>
                        {trip.totalDistance && (
                          <span className="flex items-center gap-1.5 text-foreground">
                            <Path className="w-4 h-4 text-secondaryaccent" />
                            {trip.totalDistance}
                          </span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
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
