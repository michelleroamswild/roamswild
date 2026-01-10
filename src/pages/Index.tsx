import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { SearchBar } from "@/components/SearchBar";
import { FilterChips } from "@/components/FilterChips";
import { SavedLocations } from "@/components/SavedLocations";
import { Suggestions } from "@/components/Suggestions";
import { useTrip } from "@/context/TripContext";
import { Route, Calendar, Clock, MapPin, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

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

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section with dark green topo background */}
      <div className="hero-topo">
        <Header />

        <div className="container px-4 md:px-6 py-16 md:py-24">
          <section className="text-center animate-fade-in">
            <h1 className="font-display font-bold text-white mb-4 overflow-visible">
              <span className="text-2xl md:text-3xl lg:text-4xl block mb-2">Plan Your Next</span>
              <span
                className={`text-gradient-light block text-5xl md:text-6xl lg:text-7xl transition-all duration-200 min-h-[1.2em] ${
                  isAnimating ? "opacity-0 translate-y-2" : "opacity-100 translate-y-0"
                }`}
              >
                {rotatingWords[currentWordIndex]}
              </span>
            </h1>
            <p className="text-lg md:text-xl text-white/80 max-w-2xl mx-auto mb-8">
              Discover trails, find dispersed campsites, and build the perfect overlanding route from your saved locations.
            </p>

            <SearchBar />
          </section>
        </div>
      </div>

      <main className="container px-4 md:px-6 py-8 md:py-12 topo-pattern">

        {/* My Trips Section */}
        {savedTrips.length > 0 && (
          <>
            <section className="mb-12">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-2xl font-display font-bold text-foreground">My Trips</h2>
                  <p className="text-muted-foreground mt-1">
                    {savedTrips.length} saved {savedTrips.length === 1 ? 'trip' : 'trips'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link to="/create-trip">
                    <Button variant="outline" size="sm">
                      <Plus className="w-4 h-4 mr-1" />
                      New Trip
                    </Button>
                  </Link>
                  <Link to="/my-trips">
                    <Button variant="ghost" size="sm">
                      View All
                      <ChevronRight className="w-4 h-4 ml-1" />
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {savedTrips.slice(0, 3).map((trip) => (
                  <Link key={trip.id} to={`/trip/${trip.id}`}>
                    <Card className="group hover:border-primary/30 hover:shadow-card transition-all duration-300 cursor-pointer h-full">
                      <CardContent className="p-5">
                        <h3 className="font-display font-semibold text-foreground group-hover:text-primary transition-colors truncate mb-2">
                          {trip.config.name || 'Untitled Trip'}
                        </h3>

                        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
                          <MapPin className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">
                            {trip.config.baseLocation
                              ? trip.config.baseLocation.name
                              : trip.config.startLocation?.name || 'Trip'}
                          </span>
                        </div>

                        <div className="flex items-center gap-4 text-sm">
                          <span className="flex items-center gap-1.5 text-foreground">
                            <Calendar className="w-4 h-4 text-primary" />
                            {trip.days.length} {trip.days.length === 1 ? 'day' : 'days'}
                          </span>
                          {trip.totalDistance && (
                            <span className="flex items-center gap-1.5 text-foreground">
                              <Route className="w-4 h-4 text-terracotta" />
                              {trip.totalDistance}
                            </span>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                ))}
              </div>
            </section>

            {/* Divider */}
            <div className="w-full h-px bg-border my-12" />
          </>
        )}

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
